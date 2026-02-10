/**
 * Backtest API — запуск бэктеста по историческим данным
 */

import { Router, Request, Response } from 'express';
import { DataAggregator } from '../services/dataAggregator';
import { runBacktest } from '../services/backtester';
import { normalizeSymbol } from '../lib/symbol';
import { logger } from '../lib/logger';

const router = Router();
const dataAgg = new DataAggregator();

/**
 * POST /api/backtest/run
 * Запуск бэктеста
 *
 * Body:
 * {
 *   symbol: string,       // e.g. "BTC-USDT"
 *   timeframe?: string,   // default "15m"
 *   limit?: number,       // candles, default 500
 *   initialBalance?: number,
 *   minConfidence?: number,
 *   riskRewardRatio?: number,
 *   atrSlMultiplier?: number
 * }
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      symbol?: string;
      timeframe?: string;
      limit?: number;
      initialBalance?: number;
      minConfidence?: number;
      riskRewardRatio?: number;
      atrSlMultiplier?: number;
    };
    const symbol = normalizeSymbol(body.symbol || 'BTC-USDT') || 'BTC-USDT';
    const timeframe = body.timeframe || '15m';
    const limit = Math.min(Math.max(body.limit ?? 500, 100), 2000);

    const candles = await dataAgg.getOHLCV(symbol, timeframe, limit);
    if (!candles.length) {
      res.status(404).json({ error: 'No candle data', symbol, timeframe });
      return;
    }

    const result = await runBacktest(candles, {
      symbol,
      timeframe,
      initialBalance: body.initialBalance,
      minConfidence: body.minConfidence,
      riskRewardRatio: body.riskRewardRatio,
      atrSlMultiplier: body.atrSlMultiplier
    });

    res.json(result);
  } catch (error) {
    logger.error('Backtest', '/run error', { error });
    res.status(500).json({ error: 'Backtest failed' });
  }
});

export default router;
