/**
 * Breakout Monitor — периодический скан топ монет и рассылка BREAKOUT_ALERT по WebSocket
 */

import { CoinScanner } from './coinScanner';
import { DataAggregator } from './dataAggregator';
import { LevelDetector } from './levelDetector';
import { BreakoutDetector } from './breakoutDetector';
import { BreakoutSignal } from './breakoutDetector';
import { logger } from '../lib/logger';

export interface BreakoutAlert {
  symbol: string;
  breakout: BreakoutSignal;
  coin?: { symbol: string; score?: number };
}

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_TOP_N = 5;
const DEFAULT_MIN_CONFIDENCE = 0.75;

let intervalId: ReturnType<typeof setInterval> | null = null;

export type OnBreakoutAlert = (alert: BreakoutAlert) => void;

export function startBreakoutMonitor(options?: {
  intervalMs?: number;
  topN?: number;
  minConfidence?: number;
  onAlert?: OnBreakoutAlert;
}): void {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const topN = options?.topN ?? DEFAULT_TOP_N;
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const onAlert = options?.onAlert;

  const scanner = new CoinScanner();
  const dataAgg = new DataAggregator();
  const levelDetector = new LevelDetector();
  const breakoutDetector = new BreakoutDetector();

  const run = async () => {
    try {
      const symbols = CoinScanner.getDefaultSymbols();
      const topCoins = await scanner.getTopCandidates(symbols, topN, {});
      for (const coin of topCoins) {
        try {
          const [candles, orderBook, tape] = await Promise.all([
            dataAgg.getOHLCV(coin.symbol, '15m', 200),
            dataAgg.getOrderBook(coin.symbol, 50),
            dataAgg.getTrades(coin.symbol, 100)
          ]);
          if (!candles.length) continue;
          const levels = levelDetector.detectLevels(candles, 'medium');
          const currentPrice = candles[candles.length - 1].close;
          const nearestLevel = levelDetector.findNearestLevel(currentPrice, levels, 0.02);
          if (!nearestLevel) continue;
          const breakout = breakoutDetector.detectBreakout(
            currentPrice,
            nearestLevel,
            orderBook,
            tape,
            candles
          );
          if (breakout && breakout.confidence >= minConfidence) {
            const alert: BreakoutAlert = { symbol: coin.symbol, breakout, coin };
            onAlert?.(alert);
          }
        } catch (e) {
          logger.debug('BreakoutMonitor', `Skip ${coin.symbol}`, { error: (e as Error).message });
        }
      }
    } catch (e) {
      logger.warn('BreakoutMonitor', 'Scan failed', { error: (e as Error).message });
    }
  };

  run();
  intervalId = setInterval(run, intervalMs);
  logger.info('BreakoutMonitor', `Started: every ${intervalMs / 1000}s, top ${topN}, min confidence ${minConfidence}`);
}

export function stopBreakoutMonitor(): void {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('BreakoutMonitor', 'Stopped');
  }
}
