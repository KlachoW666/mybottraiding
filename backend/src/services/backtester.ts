/**
 * Backtester — симуляция по историческим свечам и сигналам (MaksBaks)
 * Метрики: winrate, profit factor, max drawdown.
 * Сигнал: по RSI + направлению свечи (без стакана/ленты).
 */

import { OHLCVCandle } from '../types/candle';
import { CandleAnalyzer } from './candleAnalyzer';

export interface BacktestParams {
  symbol: string;
  timeframe: string;
  /** Количество свечей (или передать candles напрямую) */
  limit?: number;
  /** Начальный баланс (виртуальный) */
  initialBalance?: number;
  /** Мин. confidence для входа (0–1) */
  minConfidence?: number;
  /** R:R для TP (множитель к риску) */
  riskRewardRatio?: number;
  /** ATR множитель для SL */
  atrSlMultiplier?: number;
}

export interface BacktestTrade {
  entryBar: number;
  exitBar: number;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  sl: number;
  tp: number;
  pnl: number;
  pnlPct: number;
  win: boolean;
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  bars: number;
  initialBalance: number;
  finalBalance: number;
  totalPnl: number;
  totalPnlPct: number;
  trades: BacktestTrade[];
  totalTrades: number;
  wins: number;
  losses: number;
  winrate: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  equityCurve: number[];
}

const candleAnalyzer = new CandleAnalyzer();

export async function runBacktest(
  candles: OHLCVCandle[],
  params: Partial<BacktestParams> & { symbol: string; timeframe?: string }
): Promise<BacktestResult> {
  const minConfidence = params.minConfidence ?? 0.6;
  const riskRewardRatio = params.riskRewardRatio ?? 2;
  const atrSlMultiplier = params.atrSlMultiplier ?? 1.5;
  const initialBalance = params.initialBalance ?? 100;

  const trades: BacktestTrade[] = [];
  let balance = initialBalance;
  const equityCurve: number[] = [initialBalance];
  let peak = initialBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  const minBars = 30; // нужно для ATR и RSI
  for (let i = minBars; i < candles.length - 1; i++) {
    const slice = candles.slice(0, i + 1);
    const closes = slice.map((c) => c.close);
    const rsi = candleAnalyzer.getRSI(closes, 14);
    const last = slice[slice.length - 1];
    let direction: 'LONG' | 'SHORT' | null = null;
    let score = 0;
    if (rsi != null) {
      if (rsi < 35) {
        direction = 'LONG';
        score = 1 - rsi / 35; // 0..1
      } else if (rsi > 65) {
        direction = 'SHORT';
        score = (rsi - 65) / 35;
      }
    }
    if (!direction || score < minConfidence) continue;
    // дополнительно: направление последней свечи должно совпадать
    if (direction === 'LONG' && last.close < last.open) continue;
    if (direction === 'SHORT' && last.close > last.open) continue;

    const entryPrice = candles[i].close;
    const atr = candleAnalyzer.getATR(slice, 14);
    const riskDist = atr != null && atr > 0 ? atr * atrSlMultiplier : entryPrice * 0.01;
    const sl =
      direction === 'LONG'
        ? entryPrice - riskDist
        : entryPrice + riskDist;
    const tp =
      direction === 'LONG'
        ? entryPrice + riskDist * riskRewardRatio
        : entryPrice - riskDist * riskRewardRatio;

    // Симуляция выхода на следующих барах
    for (let j = i + 1; j < candles.length; j++) {
      const bar = candles[j];
      const hitTpLong = direction === 'LONG' && bar.high >= tp;
      const hitSlLong = direction === 'LONG' && bar.low <= sl;
      const hitTpShort = direction === 'SHORT' && bar.low <= tp;
      const hitSlShort = direction === 'SHORT' && bar.high >= sl;

      let exitPrice: number;
      let win: boolean;
      if (direction === 'LONG') {
        if (hitTpLong && hitSlLong) {
          // оба достигнуты в одном баре — смотрим кто раньше по тикам (упрощение: по open)
          exitPrice = bar.open <= sl ? sl : tp;
          win = exitPrice === tp;
        } else if (hitTpLong) {
          exitPrice = tp;
          win = true;
        } else if (hitSlLong) {
          exitPrice = sl;
          win = false;
        } else continue;
      } else {
        if (hitTpShort && hitSlShort) {
          exitPrice = bar.open >= sl ? sl : tp;
          win = exitPrice === tp;
        } else if (hitTpShort) {
          exitPrice = tp;
          win = true;
        } else if (hitSlShort) {
          exitPrice = sl;
          win = false;
        } else continue;
      }

      const pnl = direction === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
      const pnlPct = (pnl / entryPrice) * 100;
      balance += pnl;
      equityCurve.push(balance);
      if (balance > peak) peak = balance;
      const dd = peak - balance;
      const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
      if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

      trades.push({
        entryBar: i,
        exitBar: j,
        direction,
        entryPrice,
        exitPrice,
        sl,
        tp,
        pnl,
        pnlPct,
        win
      });
      break;
    }
  }

  const wins = trades.filter((t) => t.win).length;
  const losses = trades.length - wins;
  const grossProfit = trades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const totalPnl = balance - initialBalance;
  const totalPnlPct = initialBalance > 0 ? (totalPnl / initialBalance) * 100 : 0;

  return {
    symbol: params.symbol ?? 'unknown',
    timeframe: params.timeframe ?? '15m',
    bars: candles.length,
    initialBalance,
    finalBalance: balance,
    totalPnl,
    totalPnlPct,
    trades,
    totalTrades: trades.length,
    wins,
    losses,
    winrate: trades.length > 0 ? wins / trades.length : 0,
    profitFactor,
    maxDrawdown,
    maxDrawdownPct,
    equityCurve
  };
}
