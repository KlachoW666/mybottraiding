import { TradingSignal } from '../types/signal';
import { CandlePattern } from '../types/candle';
import { ASYMMETRIC_RR_MIN, detectFailedSignalHint } from '../lib/tradingPrinciples';
import { DEFAULT_TRAILING_CONFIG } from '../lib/trailingStop';

/**
 * Signal Generator - генерация торговых сигналов (раздел 3.1, 6 ТЗ)
 * guid.md: SL за POC-зоной, TP на HVN, соотношение 1:2–1:3 к стопу
 * Burniske: R:R >= 2 для асимметричных возможностей. Schwager: штраф за провалившиеся сигналы.
 */
export class SignalGenerator {
  private signalCounter = 0;

  /** PDF: SL = Entry +/- min(ATR*1.5, ATR*0.2+Buffer), TP1=1.5R(30%), TP2=2.5R(40%), TP3=4R(30%)
   * Burniske: R:R >= ASYMMETRIC_RR_MIN (2). Schwager: priceDirection для detectFailedSignalHint.
   */
  generateSignal(params: {
    symbol: string;
    exchange: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    patterns: CandlePattern[];
    rsi?: number;
    confidence?: number;
    timeframe?: string;
    mode?: string;
    atr?: number;
    /** Schwager: направление цены для распознавания провалившихся сигналов */
    priceDirection?: 'up' | 'down';
    /** Nison: риск ложного пробоя — снижение confidence */
    falseBreakoutRisk?: boolean;
  }): TradingSignal {
    this.signalCounter++;
    const id = `sig_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${String(this.signalCounter).padStart(3, '0')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 мин

    const isScalping = params.mode === 'scalping';
    let stopLoss: number;
    let takeProfit1: number;
    let takeProfit2: number;
    let takeProfit3: number;

    if (params.atr != null && params.atr > 0) {
      const is25x = params.mode === 'futures25x' || params.mode === 'scalping';
      const slPct = is25x ? 0.0055 : 0.007; // Ужесточён SL для R:R (было 0.006/0.008)
      const slDistance = Math.min(params.atr * 1.35, params.entryPrice * slPct); // ATR 1.35 вместо 1.5
      stopLoss = params.direction === 'LONG'
        ? params.entryPrice - slDistance
        : params.entryPrice + slDistance;
      const risk = Math.abs(params.entryPrice - stopLoss);
      const rrMin = is25x ? ASYMMETRIC_RR_MIN : (isScalping ? 1.5 : ASYMMETRIC_RR_MIN); // Burniske: R:R >= 2
      takeProfit1 = params.direction === 'LONG'
        ? params.entryPrice + risk * rrMin
        : params.entryPrice - risk * rrMin;
      takeProfit2 = params.direction === 'LONG'
        ? params.entryPrice + risk * (rrMin + 1.2)
        : params.entryPrice - risk * (rrMin + 1.2);
      takeProfit3 = params.direction === 'LONG'
        ? params.entryPrice + risk * (rrMin + 2.5)
        : params.entryPrice - risk * (rrMin + 2.5); // TP3 4.5R вместо 4R — выше R:R
    } else {
      const is25x = params.mode === 'futures25x';
      const slPercent = is25x ? 0.0055 : isScalping ? 0.007 : 0.013; // Ужесточён SL для R:R
      const rrMin = is25x ? ASYMMETRIC_RR_MIN : (isScalping ? 1.5 : ASYMMETRIC_RR_MIN); // Burniske: R:R >= 2
      const tpPercent = slPercent * rrMin;
      stopLoss = params.direction === 'LONG'
        ? params.entryPrice * (1 - slPercent)
        : params.entryPrice * (1 + slPercent);
      takeProfit1 = params.direction === 'LONG'
        ? params.entryPrice * (1 + tpPercent)
        : params.entryPrice * (1 - tpPercent);
      takeProfit2 = params.direction === 'LONG'
        ? params.entryPrice * (1 + tpPercent * 1.6)
        : params.entryPrice * (1 - tpPercent * 1.6);
      takeProfit3 = params.direction === 'LONG'
        ? params.entryPrice * (1 + tpPercent * 2.7)
        : params.entryPrice * (1 - tpPercent * 2.7); // Выше TP — улучшение R:R
    }

    const risk = Math.abs(params.entryPrice - stopLoss);
    const reward = Math.abs(takeProfit3 - params.entryPrice);
    const riskReward = risk > 0 ? reward / risk : 0;

    const triggers: string[] = params.patterns
      .filter(p => p !== 'none')
      .map(p => p);
    const rsiLow = isScalping ? 25 : 35;
    const rsiHigh = isScalping ? 75 : 65;
    if (params.rsi !== undefined && params.rsi < rsiLow) triggers.push('rsi_oversold_reversal');
    if (params.rsi !== undefined && params.rsi > rsiHigh) triggers.push('rsi_overbought_reversal');

    let confidence = params.confidence ?? Math.min(0.95, 0.7 + triggers.length * 0.05);

    // Burniske: штраф при R:R < ASYMMETRIC_RR_MIN — асимметричная возможность требует мин. 2:1
    if (riskReward > 0 && riskReward < ASYMMETRIC_RR_MIN && !isScalping) {
      confidence = Math.max(0.5, confidence - 0.05 * (ASYMMETRIC_RR_MIN - riskReward));
    }

    // Schwager: распознавание провалившихся сигналов — снижение confidence при противоречии RSI и цены
    const failedHint = params.priceDirection
      ? detectFailedSignalHint(params.rsi, params.priceDirection, params.direction)
      : null;
    if (failedHint) {
      confidence = Math.max(0.45, confidence - failedHint.reduceConfidence);
    }

    if (params.falseBreakoutRisk) {
      confidence = Math.max(0.5, confidence - 0.08);
      triggers.push('false_breakout_risk');
    }

    return {
      id,
      timestamp: now.toISOString(),
      symbol: params.symbol,
      exchange: params.exchange,
      direction: params.direction,
      entry_price: params.entryPrice,
      stop_loss: Math.round(stopLoss * 100) / 100,
      take_profit: [
        Math.round(takeProfit1 * 100) / 100,
        Math.round(takeProfit2 * 100) / 100,
        Math.round(takeProfit3 * 100) / 100
      ],
      risk_reward: Math.round(riskReward * 10) / 10,
      confidence: Math.round(confidence * 100) / 100,
      timeframe: params.timeframe ?? '5m',
      triggers: triggers.length ? triggers : ['manual'],
      expires_at: expiresAt.toISOString(),
      trailing_stop_config: {
        initial_stop: stopLoss,
        trail_step_pct: DEFAULT_TRAILING_CONFIG.trailStepPct,
        activation_profit_pct: DEFAULT_TRAILING_CONFIG.activationProfitPct
      }
    };
  }
}
