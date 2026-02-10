/**
 * Multi-Timeframe Analyzer — явный MTF-модуль (Phase 2)
 * Анализ 1m, 5m, 15m, 1h; confluence по направлениям; бонус к confidence при согласии всех ТФ.
 */

import { OHLCVCandle } from '../types/candle';
import { CandleAnalyzer } from './candleAnalyzer';
import { DataAggregator } from './dataAggregator';
import { logger } from '../lib/logger';

const DEFAULT_TFS = ['1m', '5m', '15m', '1h'] as const;
const TF_LIMITS: Record<string, number> = { '1m': 200, '5m': 200, '15m': 200, '1h': 150 };
const TF_WEIGHTS: Record<string, number> = { '1m': 0.15, '5m': 0.25, '15m': 0.35, '1h': 0.25 };

export interface MTFResultItem {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  score: number;
}

export interface MTFAnalysisResult {
  symbol: string;
  timeframes: string[];
  results: Record<string, MTFResultItem>;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  alignCount: number;
  totalTfs: number;
  confidenceBonus: number;
}

const candleAnalyzer = new CandleAnalyzer();

function directionFromCandles(candles: OHLCVCandle[]): MTFResultItem {
  if (!candles.length) return { direction: 'NEUTRAL', score: 0 };
  const closes = candles.map((c) => c.close);
  const rsi = candleAnalyzer.getRSI(closes, 14);
  const ema = candleAnalyzer.getEMA(closes);
  const last = candles[candles.length - 1].close;
  let longScore = 0;
  let shortScore = 0;

  if (rsi != null) {
    if (rsi < 35) longScore += 2;
    else if (rsi < 45) longScore += 1;
    else if (rsi > 65) shortScore += 2;
    else if (rsi > 55) shortScore += 1;
  }
  if (ema) {
    if (last > ema.ema21 && last > ema.ema50) longScore += 2;
    else if (last < ema.ema21 && last < ema.ema50) shortScore += 2;
    else if (last > ema.ema9) longScore += 1;
    else if (last < ema.ema9) shortScore += 1;
  }

  const direction = longScore > shortScore ? 'LONG' : shortScore > longScore ? 'SHORT' : 'NEUTRAL';
  const score = Math.max(longScore, shortScore);
  return { direction, score };
}

/**
 * Запуск MTF-анализа по символу.
 * Загружает свечи по каждому ТФ, считает направление, confluence и бонус к confidence.
 */
export async function runMTFAnalysis(
  symbol: string,
  timeframes: string[] = [...DEFAULT_TFS]
): Promise<MTFAnalysisResult> {
  const dataAgg = new DataAggregator();
  const validTfs = timeframes.filter((tf) => TF_LIMITS[tf] ?? 200);
  if (validTfs.length === 0) {
    return {
      symbol,
      timeframes: [],
      results: {},
      direction: 'NEUTRAL',
      alignCount: 0,
      totalTfs: 0,
      confidenceBonus: 0
    };
  }

  const candlesByTf: Record<string, OHLCVCandle[]> = {};
  await Promise.all(
    validTfs.map(async (tf) => {
      try {
        const candles = await dataAgg.getOHLCV(symbol, tf, TF_LIMITS[tf] ?? 200);
        candlesByTf[tf] = candles;
      } catch (e) {
        logger.warn('MTFAnalyzer', `Failed to fetch ${symbol} ${tf}`, { error: (e as Error).message });
      }
    })
  );

  const tfResults: Record<string, MTFResultItem> = {};
  let longWeight = 0;
  let shortWeight = 0;

  for (const tf of validTfs) {
    const candles = candlesByTf[tf];
    if (!candles?.length) continue;
    const item = directionFromCandles(candles);
    tfResults[tf] = item;
    const w = TF_WEIGHTS[tf] ?? 0.25;
    if (item.direction === 'LONG') longWeight += w;
    else if (item.direction === 'SHORT') shortWeight += w;
  }

  const direction: 'LONG' | 'SHORT' | 'NEUTRAL' =
    longWeight > shortWeight + 0.1 ? 'LONG' : shortWeight > longWeight + 0.1 ? 'SHORT' : 'NEUTRAL';
  const alignCount = Object.values(tfResults).filter((r) => r.direction === direction).length;
  const totalTfs = Object.keys(tfResults).length;

  let confidenceBonus = 0;
  if (totalTfs >= 4 && alignCount >= 4) confidenceBonus = 0.15;
  else if (totalTfs >= 3 && alignCount >= 3) confidenceBonus = 0.08;
  else if (alignCount >= 2) confidenceBonus = 0.03;

  return {
    symbol,
    timeframes: validTfs,
    results: tfResults,
    direction,
    alignCount,
    totalTfs,
    confidenceBonus
  };
}
