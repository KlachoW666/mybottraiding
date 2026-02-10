/**
 * Scanner API Routes - отбор монет для скальпинга
 */

import { Router, Request, Response } from 'express';
import { CoinScanner, ScanCriteria, CoinScore } from '../services/coinScanner';
import { LevelDetector } from '../services/levelDetector';
import { BreakoutDetector } from '../services/breakoutDetector';
import { DataAggregator } from '../services/dataAggregator';
import { FundingRateMonitor } from '../services/fundingRateMonitor';
import { buildVolumeProfile } from '../services/clusterAnalyzer';
import { runMTFAnalysis } from '../services/mtfAnalyzer';
import { logger } from '../lib/logger';

const router = Router();
const scanner = new CoinScanner();
const levelDetector = new LevelDetector();
const breakoutDetector = new BreakoutDetector();
const dataAgg = new DataAggregator();
const fundingMonitor = new FundingRateMonitor();

/**
 * POST /api/scanner/scan
 * Сканировать список монет
 *
 * Body:
 * {
 *   "symbols": ["BTC/USDT:USDT", "ETH/USDT:USDT", ...],
 *   "criteria": {
 *     "minVolume24h": 1000000,
 *     "minVolatility24h": 5,
 *     "checkBBSqueeze": true,
 *     "checkMomentum": true
 *   }
 * }
 */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const { symbols, criteria } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: 'symbols array required' });
    }

    const results = await scanner.quickScan(symbols, criteria);

    res.json({
      success: true,
      count: results.length,
      coins: results
    });
  } catch (error) {
    logger.error('Scanner', '/scan error', { error });
    res.status(500).json({ error: 'Scan failed' });
  }
});

/**
 * GET /api/scanner/top
 * Получить топ N монет по умолчанию
 *
 * Query params:
 * - limit: количество (default 10)
 * - minVolume24h: мин. объём (default 1M)
 * - minVolatility24h: мин. волатильность (default 5%)
 */
router.get('/top', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const criteria: Partial<ScanCriteria> = {
      minVolume24h: parseInt(req.query.minVolume24h as string) || 1_000_000,
      minVolatility24h: parseFloat(req.query.minVolatility24h as string) || 5,
      checkBBSqueeze: req.query.checkBBSqueeze !== 'false',
      checkMomentum: req.query.checkMomentum !== 'false'
    };

    const symbols = CoinScanner.getDefaultSymbols();
    const results = await scanner.getTopCandidates(symbols, limit, criteria);

    res.json({
      success: true,
      count: results.length,
      coins: results
    });
  } catch (error) {
    logger.error('Scanner', '/top error', { error });
    res.status(500).json({ error: 'Scan failed' });
  }
});

/**
 * GET /api/scanner/levels/:symbol
 * Получить уровни Support/Resistance для символа
 *
 * Params:
 * - symbol: символ (напр. "BTCUSDT")
 *
 * Query:
 * - timeframe: таймфрейм (default 15m)
 * - limit: количество свечей (default 200)
 * - sensitivity: low | medium | high (default medium)
 */
router.get('/levels/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol;
    const timeframe = (req.query.timeframe as string) || '15m';
    const limit = parseInt(req.query.limit as string) || 200;
    const sensitivity = (req.query.sensitivity as 'low' | 'medium' | 'high') || 'medium';

    const candles = await dataAgg.getOHLCV(symbol, timeframe, limit);
    if (!candles.length) {
      return res.status(404).json({ error: 'No data for symbol' });
    }

    const levels = levelDetector.detectLevels(candles, sensitivity);
    const currentPrice = candles[candles.length - 1].close;

    // Найти ближайший уровень
    const nearestLevel = levelDetector.findNearestLevel(currentPrice, levels);

    res.json({
      success: true,
      symbol,
      currentPrice,
      levelsCount: levels.length,
      levels: levels.slice(0, 10), // топ-10 самых сильных
      nearestLevel
    });
  } catch (error) {
    logger.error('Scanner', '/levels error', { error });
    res.status(500).json({ error: 'Level detection failed' });
  }
});

/**
 * GET /api/scanner/breakout/:symbol
 * Детекция пробоя уровня для символа
 *
 * Params:
 * - symbol: символ
 *
 * Query:
 * - timeframe: таймфрейм (default 15m)
 */
router.get('/breakout/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol;
    const timeframe = (req.query.timeframe as string) || '15m';

    // Получить данные
    const candles = await dataAgg.getOHLCV(symbol, timeframe, 200);
    const orderBook = await dataAgg.getOrderBook(symbol, 50);
    const tape = await dataAgg.getTrades(symbol, 100);

    if (!candles.length) {
      return res.status(404).json({ error: 'No data for symbol' });
    }

    // Детекция уровней
    const levels = levelDetector.detectLevels(candles, 'medium');
    if (!levels.length) {
      return res.json({
        success: true,
        symbol,
        breakoutDetected: false,
        message: 'No significant levels detected'
      });
    }

    const currentPrice = candles[candles.length - 1].close;

    // Проверить пробой ближайшего уровня
    const nearestLevel = levelDetector.findNearestLevel(currentPrice, levels, 0.02); // в пределах 2%

    if (!nearestLevel) {
      return res.json({
        success: true,
        symbol,
        breakoutDetected: false,
        message: 'Price not near any significant level'
      });
    }

    // Funding rate как контриндикатор (Phase 2)
    let fundingHint: { shouldAvoidLong: boolean; shouldAvoidShort: boolean } | undefined;
    try {
      const funding = await fundingMonitor.getFundingRate(symbol);
      if (funding) fundingHint = { shouldAvoidLong: funding.shouldAvoidLong, shouldAvoidShort: funding.shouldAvoidShort };
    } catch {
      // ignore
    }

    // Детекция пробоя
    const breakout = breakoutDetector.detectBreakout(
      currentPrice,
      nearestLevel,
      orderBook,
      tape,
      candles,
      fundingHint
    );

    if (!breakout) {
      return res.json({
        success: true,
        symbol,
        breakoutDetected: false,
        nearestLevel,
        message: 'No breakout detected'
      });
    }

    res.json({
      success: true,
      symbol,
      breakoutDetected: true,
      breakout
    });
  } catch (error) {
    logger.error('Scanner', '/breakout error', { error });
    res.status(500).json({ error: 'Breakout detection failed' });
  }
});

/**
 * POST /api/scanner/full-analysis
 * Полный анализ: скан + уровни + пробой для топ монет
 *
 * Body:
 * {
 *   "topN": 5,
 *   "criteria": { ... }
 * }
 */
router.post('/full-analysis', async (req: Request, res: Response) => {
  try {
    const topN = req.body.topN || 5;
    const criteria = req.body.criteria || {};

    // 1. Сканирование топ монет
    const symbols = CoinScanner.getDefaultSymbols();
    const topCoins = await scanner.getTopCandidates(symbols, topN, criteria);

    // 2. Для каждой монеты: уровни + пробой
    const analysis = [];

    for (const coin of topCoins) {
      try {
        const candles = await dataAgg.getOHLCV(coin.symbol, '15m', 200);
        const orderBook = await dataAgg.getOrderBook(coin.symbol, 50);
        const tape = await dataAgg.getTrades(coin.symbol, 100);

        if (!candles.length) continue;

        const levels = levelDetector.detectLevels(candles, 'medium');
        const currentPrice = candles[candles.length - 1].close;
        const nearestLevel = levelDetector.findNearestLevel(currentPrice, levels, 0.02);

        let breakout = null;
        if (nearestLevel) {
          breakout = breakoutDetector.detectBreakout(
            currentPrice,
            nearestLevel,
            orderBook,
            tape,
            candles
          );
        }

        analysis.push({
          coin,
          levelsCount: levels.length,
          topLevels: levels.slice(0, 5),
          nearestLevel,
          breakout
        });
      } catch (e) {
        logger.warn('Scanner', `Analysis failed for ${coin.symbol}`, { error: e });
      }
    }

    res.json({
      success: true,
      analyzedCoins: analysis.length,
      analysis
    });
  } catch (error) {
    logger.error('Scanner', '/full-analysis error', { error });
    res.status(500).json({ error: 'Full analysis failed' });
  }
});

/**
 * GET /api/scanner/mtf/:symbol
 * Multi-timeframe анализ (Phase 2): 1m, 5m, 15m, 1h; confluence и бонус к confidence
 * Query: timeframes=1m,5m,15m,1h (default)
 */
router.get('/mtf/:symbol', async (req: Request, res: Response) => {
  try {
    const raw = (req.params.symbol || '').replace(/_/g, '-');
    const symbol = raw.includes('-') ? raw : `${raw}-USDT`;
    const tfQuery = (req.query.timeframes as string) || '1m,5m,15m,1h';
    const timeframes = tfQuery.split(',').map((s) => s.trim()).filter(Boolean);
    const result = await runMTFAnalysis(symbol, timeframes.length ? timeframes : ['1m', '5m', '15m', '1h']);
    res.json(result);
  } catch (error) {
    logger.error('Scanner', '/mtf error', { error });
    res.status(500).json({ error: 'MTF analysis failed' });
  }
});

/**
 * GET /api/scanner/funding/:symbol
 * Ставка финансирования (MaksBaks Урок 5)
 */
router.get('/funding/:symbol', async (req: Request, res: Response) => {
  try {
    const raw = (req.params.symbol || '').replace(/_/g, '-');
    const symbol = raw.includes('-') ? raw : `${raw}-USDT`;
    const result = await fundingMonitor.getFundingRate(symbol);
    if (!result) return res.status(404).json({ error: 'Funding rate not available' });
    res.json(result);
  } catch (error) {
    logger.error('Scanner', '/funding error', { error });
    res.status(500).json({ error: 'Funding rate failed' });
  }
});

/**
 * GET /api/scanner/volume-profile/:symbol
 * Volume Profile: POC, HVN, LVN (MaksBaks Урок 8)
 */
router.get('/volume-profile/:symbol', async (req: Request, res: Response) => {
  try {
    const raw = (req.params.symbol || '').replace(/_/g, '-');
    const symbol = raw.includes('-') ? raw : `${raw}-USDT`;
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
    const [trades, candles] = await Promise.all([
      dataAgg.getTrades(symbol, limit),
      dataAgg.getOHLCV(symbol, '15m', 50)
    ]);
    if (!trades.length) return res.status(404).json({ error: 'No trade data' });
    const midPrice = candles.length
      ? candles[candles.length - 1].close
      : (trades.reduce((s, t) => s + t.price, 0) / trades.length);
    const priceStep = midPrice * 0.001;
    const profile = buildVolumeProfile(trades, priceStep, midPrice);
    res.json({ symbol, midPrice, priceStep, ...profile });
  } catch (error) {
    logger.error('Scanner', '/volume-profile error', { error });
    res.status(500).json({ error: 'Volume profile failed' });
  }
});

export default router;
