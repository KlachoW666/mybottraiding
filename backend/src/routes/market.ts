import { Router } from 'express';
import { DataAggregator } from '../services/dataAggregator';
import { getBroadcastSignal } from '../websocket';
import { CandleAnalyzer } from '../services/candleAnalyzer';
import { SignalGenerator } from '../services/signalGenerator';
import { addSignal, getSignalsSince } from './signals';
import { CandlePattern } from '../types/candle';
import {
  analyzeOrderBook,
  analyzeTape,
  analyzeCandles,
  computeSignal,
  buildAnalysisBreakdown
} from '../services/marketAnalysis';
import { config } from '../config';
import { normalizeSymbol } from '../lib/symbol';
import { logger } from '../lib/logger';
import { VOLUME_BREAKOUT_MULTIPLIER, volatilitySizeMultiplier, isPotentialFalseBreakout } from '../lib/tradingPrinciples';
import { FundamentalFilter } from '../services/fundamentalFilter';
import { adjustConfidence, update as mlUpdate } from '../services/onlineMLService';
import { calcLiquidationPrice, calcLiquidationPriceSimple } from '../lib/liquidationPrice';
import { executeSignal } from '../services/autoTrader';

const router = Router();

/** Флаги исполнения при авто-анализе (устанавливаются из POST /auto-analyze/start) */
let autoAnalyzeExecuteOrders = false;
let autoAnalyzeUseTestnet = true;
let autoAnalyzeMaxPositions = 2;
let autoAnalyzeSizePercent = 5;
let autoAnalyzeLeverage = 25;
const faFilter = new FundamentalFilter();
const aggregator = new DataAggregator();
const candleAnalyzer = new CandleAnalyzer();
const signalGenerator = new SignalGenerator();

router.get('/candles/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(req.params.symbol || 'BTC-USDT')) || 'BTC-USDT';
    const timeframe = (req.query.timeframe as string) || '5m';
    const limit = Math.min(parseInt(req.query.limit as string) || candlesFor48h(timeframe), config.limits.candlesMax);
    const candles = await aggregator.getOHLCVByExchange(symbol, timeframe, limit);
    res.json(candles);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/exchanges', (_req, res) => {
  res.json(aggregator.getExchangeIds());
});

router.get('/ticker/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(req.params.symbol || 'BTC-USDT')) || 'BTC-USDT';
    const price = await aggregator.getCurrentPrice(symbol);
    res.json({ price, symbol, exchange: 'okx' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Цена с OKX */
router.get('/price/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(req.params.symbol || 'BTC-USDT')) || 'BTC-USDT';
    const price = await aggregator.getCurrentPrice(symbol);
    res.json({ price, symbol });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/trades/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(req.params.symbol || 'BTC-USDT')) || 'BTC-USDT';
    const limit = Math.min(parseInt(req.query.limit as string) || 30, config.limits.trades);
    const trades = await aggregator.getTrades(symbol, limit);
    res.json(trades);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/orderbook/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(decodeURIComponent(req.params.symbol || 'BTC-USDT')) || 'BTC-USDT';
    const limit = Math.min(parseInt(req.query.limit as string) || 50, config.limits.orderBook);
    const data = await aggregator.getOrderBookByExchange(symbol, limit);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

function detectThreeWhiteSoldiers(candles: { open: number; high: number; close: number }[]): boolean {
  if (candles.length < 3) return false;
  const [a, b, c] = candles.slice(-3);
  return a.close > a.open && b.close > b.open && c.close > c.open &&
    b.high > a.high && c.high > b.high && a.close < b.open && b.close < c.open;
}

let autoAnalyzeTimer: NodeJS.Timeout | null = null;

function candlesFor48h(timeframe: string): number {
  const needed = config.timeframes[timeframe] ?? 192;
  return Math.min(Math.max(needed, 100), config.limits.candles);
}

/** Лимиты свечей для глубокого Multi-TF анализа (HTF-first) */
const MTF_LIMITS: Record<string, number> = { '1m': 500, '5m': 600, '15m': 400, '1h': 250, '4h': 150, '1d': 150 };

/** Веса: HTF (1d, 4h) определяют тренд, MTF (1h) — подтверждение, LTF (15m, 5m, 1m) — вход */
const MTF_WEIGHTS: Record<string, number> = { '1d': 0.25, '4h': 0.20, '1h': 0.20, '15m': 0.15, '5m': 0.10, '1m': 0.10 };

/** Рыночная структура: HH/HL = бычий, LH/LL = медвежий. Swing = локальный экстремум в окне 3 */
function detectMarketStructure(candles: { high: number; low: number; close: number }[]): 'bullish' | 'bearish' | 'neutral' {
  if (candles.length < 15) return 'neutral';
  const lookback = 3;
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    let isSH = true, isSL = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= h || candles[i + j].high >= h) isSH = false;
      if (candles[i - j].low <= l || candles[i + j].low <= l) isSL = false;
    }
    if (isSH) swingHighs.push(h);
    if (isSL) swingLows.push(l);
  }
  const shLast = swingHighs.slice(-4);
  const slLast = swingLows.slice(-4);
  if (shLast.length < 2 || slLast.length < 2) return 'neutral';
  const hh = shLast[shLast.length - 1] > shLast[shLast.length - 2];
  const hl = slLast[slLast.length - 1] > slLast[slLast.length - 2];
  const lh = shLast[shLast.length - 1] < shLast[shLast.length - 2];
  const ll = slLast[slLast.length - 1] < slLast[slLast.length - 2];
  if (hh && hl) return 'bullish';
  if (lh && ll) return 'bearish';
  return 'neutral';
}

function detectPatterns(candles: { open: number; high: number; low: number; close: number; volume?: number }[], analyzer: CandleAnalyzer): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  if (candles.length < 2) return patterns;
  const lastCandle = candles[candles.length - 1];
  const engulfing = analyzer.detectEngulfing(candles as any);
  if (engulfing !== 'none') patterns.push(engulfing);
  const prev3 = candles.slice(-4, -1);
  const priorDown = prev3.filter((c) => c.close < c.open).length >= 2;
  if (analyzer.detectHammer(lastCandle as any)) patterns.push(priorDown ? 'hammer' : 'hanging_man');
  if (analyzer.detectInvertedHammer(lastCandle as any)) patterns.push(priorDown ? 'inverted_hammer' : 'shooting_star');
  if (analyzer.detectDoji(lastCandle as any)) {
    if (analyzer.detectDragonflyDoji(lastCandle as any)) patterns.push('dragonfly_doji');
    else if (analyzer.detectGravestoneDoji(lastCandle as any)) patterns.push('gravestone_doji');
    else patterns.push('doji');
  }
  if (analyzer.detectSpinningTop(lastCandle as any)) patterns.push('spinning_top');
  if (analyzer.detectTweezerTops(candles as any)) patterns.push('tweezer_tops');
  if (analyzer.detectTweezerBottoms(candles as any)) patterns.push('tweezer_bottoms');
  const harami = analyzer.detectHarami(candles as any);
  if (harami !== 'none') patterns.push(harami);
  if (analyzer.detectPiercingLine(candles as any)) patterns.push('piercing_line');
  if (analyzer.detectDarkCloudCover(candles as any)) patterns.push('dark_cloud_cover');
  if (analyzer.detectMorningStar(candles as any)) patterns.push('morning_star');
  if (analyzer.detectEveningStar(candles as any)) patterns.push('evening_star');
  if (detectThreeWhiteSoldiers(candles)) patterns.push('three_white_soldiers');
  if (analyzer.detectThreeBlackCrows(candles as any)) patterns.push('three_black_crows');
  if (analyzer.detectBullMarubozu(lastCandle as any)) patterns.push('bull_marubozu');
  if (analyzer.detectBearMarubozu(lastCandle as any)) patterns.push('bear_marubozu');
  return patterns;
}

export async function runAnalysis(symbol: string, timeframe = '5m', mode = 'default', opts?: { silent?: boolean }) {
  const sym = normalizeSymbol(symbol) || 'BTC-USDT';
  const { limits } = config;

  const [orderBook, trades, entryPrice, candles1m, candles5m, candles15m, candles1h, candles4h, candles1d] = await Promise.all([
    aggregator.getOrderBook(sym, limits.orderBook),
    aggregator.getTrades(sym, limits.trades),
    aggregator.getCurrentPrice(sym),
    aggregator.getOHLCV(sym, '1m', MTF_LIMITS['1m'] ?? 500),
    aggregator.getOHLCV(sym, '5m', MTF_LIMITS['5m'] ?? 600),
    aggregator.getOHLCV(sym, '15m', MTF_LIMITS['15m'] ?? 400),
    aggregator.getOHLCV(sym, '1h', MTF_LIMITS['1h'] ?? 250),
    aggregator.getOHLCV(sym, '4h', MTF_LIMITS['4h'] ?? 150),
    aggregator.getOHLCV(sym, '1d', MTF_LIMITS['1d'] ?? 150)
  ]);

  // Data validation (crypto-trading-open + freqtrade startup_candle_count)
  const MIN_OB_LEVELS = 5;
  const MIN_TRADES = 5;
  const MIN_CANDLES_5M = 50;
  const obValid = (orderBook.bids?.length ?? 0) >= MIN_OB_LEVELS && (orderBook.asks?.length ?? 0) >= MIN_OB_LEVELS;
  const tradesValid = (trades?.length ?? 0) >= MIN_TRADES;
  const candles5mValid = (candles5m?.length ?? 0) >= MIN_CANDLES_5M;
  if (!obValid || !tradesValid || !candles5mValid) {
    logger.warn('runAnalysis', 'Insufficient OKX data', {
      symbol: sym,
      ob: `${orderBook.bids?.length ?? 0}/${orderBook.asks?.length ?? 0}`,
      trades: trades?.length ?? 0,
      candles5m: candles5m?.length ?? 0
    });
    if (!candles5mValid && !opts?.silent) {
      const emptyOb = analyzeOrderBook({ bids: orderBook.bids || [], asks: orderBook.asks || [] });
      const emptyTape = analyzeTape([]);
      const emptyCandles = { direction: 'NEUTRAL' as const, score: 0, patterns: [], rsi: null, emaTrend: null, volumeConfirm: false, bbSqueeze: false, highVolatility: false };
      const emptyBreakdown = buildAnalysisBreakdown(emptyOb, emptyTape, emptyCandles, { direction: null, confidence: 0, reason: 'Insufficient candles' });
      const emptySignal = signalGenerator.generateSignal({
        symbol: sym.replace('-', '/'),
        exchange: 'OKX',
        direction: 'LONG',
        entryPrice: entryPrice || 0,
        patterns: ['none'],
        confidence: 0,
        timeframe,
        mode
      });
      return { signal: emptySignal, analysis: {}, breakdown: emptyBreakdown, dataInsufficient: true };
    }
  }

  const obSignal = analyzeOrderBook({ bids: orderBook.bids || [], asks: orderBook.asks || [] });

  const tradesMapped = (trades || []).map((t: any) => ({
    price: t.price,
    amount: t.amount,
    time: t.time,
    isBuy: t.isBuy ?? false,
    quoteQuantity: t.quoteQuantity ?? t.price * t.amount
  }));
  const tapeSignal = analyzeTape(tradesMapped);

  const now = Date.now();
  const TAPE_WINDOWS_MS = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000 } as const;
  const TAPE_WEIGHTS = { '1m': 0.25, '5m': 0.35, '15m': 0.25, '1h': 0.15 } as const;
  let tapeLongW = 0;
  let tapeShortW = 0;
  const tapeWindowResults: Record<string, { direction: string; delta: number }> = {};
  for (const w of ['1m', '5m', '15m', '1h'] as const) {
    const windowTrades = tradesMapped.filter((t) => t.time >= now - TAPE_WINDOWS_MS[w]);
    if (windowTrades.length < 5) continue;
    const res = analyzeTape(windowTrades);
    tapeWindowResults[w] = { direction: res.direction, delta: res.delta };
    const wgt = TAPE_WEIGHTS[w];
    if (res.direction === 'LONG') tapeLongW += wgt;
    else if (res.direction === 'SHORT') tapeShortW += wgt;
  }
  const tapeWindowDir = tapeLongW > tapeShortW + 0.2 ? 'LONG' : tapeShortW > tapeLongW + 0.2 ? 'SHORT' : tapeSignal.direction;

  const candles = candles5m;
  const mtfCandles = { '1m': candles1m, '5m': candles5m, '15m': candles15m, '1h': candles1h, '4h': candles4h, '1d': candles1d } as const;

  let longWeight = 0;
  let shortWeight = 0;
  const mtfResults: Record<string, { direction: string; score: number }> = {};
  const tfOrder: (keyof typeof mtfCandles)[] = ['1d', '4h', '1h', '15m', '5m', '1m'];

  for (const tf of tfOrder) {
    const cs = mtfCandles[tf];
    if (!cs?.length || cs.length < 5) continue;
    const closes = cs.map((c) => c.close);
    const patterns = detectPatterns(cs, candleAnalyzer);
    const rsi = candleAnalyzer.getRSI(closes);
    const macd = candleAnalyzer.getMACD(closes);
    const bb = candleAnalyzer.getBollingerBands(closes);
    const ema = candleAnalyzer.getEMA(closes);
    const bbWidth = candleAnalyzer.getBollingerBandsWidth(closes);
    const res = analyzeCandles(cs, patterns, rsi ?? null, macd, bb, {
      patterns, rsi: rsi ?? null, macd, bb, ema, atr: null, macdCrossover: candleAnalyzer.getMACDCrossover(closes),
      bbWidth: bbWidth?.width, avgBbWidth: bbWidth?.avgWidth
    });
    const lastClose = cs[cs.length - 1].close;
    if (ema && (tf === '1h' || tf === '4h' || tf === '1d')) {
      if (lastClose > ema.ema21 && lastClose > ema.ema50 && res.direction === 'NEUTRAL') res.direction = 'LONG';
      else if (lastClose < ema.ema21 && lastClose < ema.ema50 && res.direction === 'NEUTRAL') res.direction = 'SHORT';
    }
    const structure = cs.length >= 15 ? detectMarketStructure(cs) : 'neutral';
    if (structure === 'bullish' && res.direction === 'NEUTRAL') res.direction = 'LONG';
    if (structure === 'bearish' && res.direction === 'NEUTRAL') res.direction = 'SHORT';
    mtfResults[tf] = { direction: res.direction, score: res.score };
    const w = MTF_WEIGHTS[tf] ?? 0.2;
    if (res.direction === 'LONG') longWeight += w;
    else if (res.direction === 'SHORT') shortWeight += w;
  }

  const mtfDir: 'LONG' | 'SHORT' | 'NEUTRAL' = longWeight > shortWeight + 0.15 ? 'LONG' : shortWeight > longWeight + 0.15 ? 'SHORT' : 'NEUTRAL';
  const mtfScore = Math.max(longWeight, shortWeight) * 15;
  const mtfAlignCount = Object.values(mtfResults).filter((r) => r.direction === mtfDir).length;

  const htf1d = candles1d.length >= 15 ? detectMarketStructure(candles1d) : 'neutral';
  const htf4h = candles4h.length >= 15 ? detectMarketStructure(candles4h) : 'neutral';
  const htfBull = htf1d === 'bullish' || htf4h === 'bullish';
  const htfBear = htf1d === 'bearish' || htf4h === 'bearish';
  const againstHTF = (mtfDir === 'LONG' && htfBear) || (mtfDir === 'SHORT' && htfBull);

  const rsi = candles5m.length ? candleAnalyzer.getRSI(candles5m.map((c) => c.close)) : null;
  let patterns = detectPatterns(candles5m, candleAnalyzer);
  // Freqtrade-strategies: BinHV45, ClucMay72018, HLHB, VolatilitySystem, BinHV27 (ADX/emarsi)
  if (candleAnalyzer.detectBinHV45LowerBB(candles5m as any)) patterns = [...patterns, 'binhv45_lower_bb_reversal'];
  if (candleAnalyzer.detectClucLowVolumeDip(candles5m as any)) patterns = [...patterns, 'cluc_low_volume_dip'];
  const hlhbDir = candleAnalyzer.detectHLHBCross(candles5m as any);
  if (hlhbDir) patterns = [...patterns, hlhbDir === 'LONG' ? 'hlhb_ema_rsi_cross' : 'hlhb_ema_rsi_cross_bear'];
  const volBreakout = candleAnalyzer.detectVolatilityBreakout(candles5m);
  if (volBreakout) patterns = [...patterns, volBreakout === 'LONG' ? 'volatility_breakout' : 'volatility_breakout_bear'];
  const adx = candleAnalyzer.getADX(candles5m);
  if (adx != null && adx > 25) patterns = [...patterns, 'adx_trend'];
  const emarsi = candleAnalyzer.getEMARSI(candles5m.map((c) => c.close));
  if (emarsi != null && emarsi <= 20) patterns = [...patterns, 'emarsi_oversold'];
  const supertrendDir = candleAnalyzer.getSupertrend(candles5m);
  if (supertrendDir) patterns = [...patterns, supertrendDir === 'up' ? 'supertrend_up' : 'supertrend_down'];
  const lastC5 = candles5m[candles5m.length - 1];
  const highVolatility = lastC5 && lastC5.close > 0
    ? (lastC5.high - lastC5.low) / lastC5.close > 0.03
    : false;
  const candlesSignal = {
    direction: mtfDir !== 'NEUTRAL' ? mtfDir : (Object.values(mtfResults)[0]?.direction as 'LONG' | 'SHORT') ?? 'NEUTRAL',
    score: mtfScore,
    volumeConfirm: candles5m.length >= 20 &&
      (candles5m[candles5m.length - 1]?.volume ?? 0) > candles5m.slice(-20).reduce((s, c) => s + (c.volume ?? 0), 0) / 20 * VOLUME_BREAKOUT_MULTIPLIER,
    bbSqueeze: false,
    patterns,
    rsi,
    emaTrend: null as 'bullish' | 'bearish' | null,
    highVolatility,
    freqtrade: { adx, emarsi, supertrendDir, hlhbDir, volBreakout }
  };
  const atr = candleAnalyzer.getATR(candles5m);
  const avgAtr = candleAnalyzer.getATRAvg(candles5m);
  const volatilityMultiplier = volatilitySizeMultiplier(atr ?? null, avgAtr ?? null);
  const currVol = candles5m.length ? (candles5m[candles5m.length - 1]?.volume ?? 0) : 0;
  const avgVol20 = candles5m.length >= 20 ? candles5m.slice(-20).reduce((s, c) => s + (c.volume ?? 0), 0) / 20 : 0;
  const falseBreakoutHint = patterns.some((p) => p.includes('engulfing') || p.includes('breakout'))
    ? isPotentialFalseBreakout(currVol, avgVol20, true)
    : false;

  // Layer 2: Fundamental Filter (generate-complete-guide, Burniske) — блок при слабом рынке
  if (!faFilter.isValid(obSignal.spreadPct)) {
    if (!opts?.silent) logger.info('runAnalysis', 'FA Failed: spread/liquidity', { symbol: sym, spreadPct: obSignal.spreadPct });
    const emptyBreakdown = buildAnalysisBreakdown(obSignal, tapeSignal, candlesSignal, { direction: null, confidence: 0, reason: 'FA Failed: spread/liquidity' });
    const emptySignal = signalGenerator.generateSignal({
      symbol: sym.replace('-', '/'),
      exchange: 'OKX',
      direction: 'LONG',
      entryPrice,
      patterns: ['none'],
      confidence: 0,
      timeframe,
      mode
    });
    return { signal: emptySignal, analysis: {}, breakdown: emptyBreakdown, faBlocked: true };
  }

  const tapeForSignal = tapeWindowDir !== 'NEUTRAL'
    ? { ...tapeSignal, direction: tapeWindowDir as 'LONG' | 'SHORT' }
    : tapeSignal;
  const signalResult = computeSignal(
    {
      candles: { direction: candlesSignal.direction, score: candlesSignal.score },
      orderBook: obSignal,
      tape: tapeForSignal
    },
    {
      spreadPct: obSignal.spreadPct,
      volumeConfirm: candlesSignal.volumeConfirm,
      bbSqueeze: candlesSignal.bbSqueeze,
      tapeDelta: tapeSignal.delta,
      tapeRecentDelta: tapeSignal.recentDelta,
      obDomScore: obSignal.domScore,
      cvdDivergence: tapeSignal.cvdDivergence,
      highVolatility: candlesSignal.highVolatility,
      falseBreakoutHint
    }
  );
  const { direction: confluentDir, confidence: confluentConf, confluence } = signalResult;

  let direction: 'LONG' | 'SHORT' = 'LONG';
  let confidence = 0.65;

  if (confluence && confluentDir) {
    direction = confluentDir;
    confidence = confluentConf;

    // Multi-TF alignment bonus — 6 TFs (1d, 4h, 1h, 15m, 5m, 1m) в одном направлении
    // Корректировка: требуем 4+ TFs для высокого confidence, строже за 2–3
    if (mtfAlignCount >= 5) confidence = Math.min(0.96, confidence + 0.10);
    else if (mtfAlignCount >= 4) confidence = Math.min(0.95, confidence + 0.06);
    else if (mtfAlignCount >= 3) confidence = Math.min(0.90, confidence + 0.02);
    if (mtfAlignCount < 3 && Object.keys(mtfResults).length >= 5) {
      confidence = Math.max(0.55, confidence - 0.08);
    }
    if (mtfAlignCount < 4 && Object.keys(mtfResults).length >= 5) {
      confidence = Math.min(confidence, 0.88);
    }
    // Усиленный штраф против HTF — часто приводит к убыткам
    if (againstHTF) confidence = Math.max(0.50, Math.min(confidence - 0.15, 0.70));
    // Freqtrade: бонус при совпадении HLHB/VolatilityBreakout/Supertrend
    if (hlhbDir === direction) confidence = Math.min(0.96, confidence + 0.04);
    if (volBreakout === direction) confidence = Math.min(0.96, confidence + 0.03);
    if (supertrendDir === (direction === 'LONG' ? 'up' : 'down')) confidence = Math.min(0.95, confidence + 0.02);
    if (adx != null && adx > 30) confidence = Math.min(0.94, confidence + 0.02);
  }

  let fallbackReason: string | undefined;
  if (!confluence || !confluentDir) {
    const dirs = [obSignal.direction, tapeSignal.direction, candlesSignal.direction];
    let longCount = dirs.filter((d) => d === 'LONG').length;
    let shortCount = dirs.filter((d) => d === 'SHORT').length;
    // Freqtrade: HLHB и VolatilityBreakout добавляют вес направлению
    if (hlhbDir === 'LONG') longCount += 0.5; else if (hlhbDir === 'SHORT') shortCount += 0.5;
    if (volBreakout === 'LONG') longCount += 0.5; else if (volBreakout === 'SHORT') shortCount += 0.5;
    const hasConflict = (longCount > 0 && shortCount > 0);
    if (hasConflict) {
      // Аналитика: при конфликте снижаем уверенность — такие сделки чаще убыточны
      direction = shortCount >= longCount ? 'SHORT' : 'LONG';
      confidence = 0.55;
      fallbackReason = `Конфликт компонентов — направление по большинству (${direction}), уверенность снижена. Не рекомендуется к авто-входу.`;
    } else if (shortCount > longCount) {
      direction = 'SHORT';
      confidence = Math.min(0.75, 0.6 + shortCount * 0.04);
      fallbackReason = `Fallback: направление по голосам компонентов (SHORT), без полной конfluence.`;
    } else {
      direction = 'LONG';
      confidence = Math.min(0.75, 0.6 + Math.max(longCount, 1) * 0.04);
      fallbackReason = `Fallback: направление по голосам компонентов (LONG), без полной конfluence.`;
    }
  }

  const breakdownInput = { ...signalResult, direction, confidence, reason: fallbackReason ?? signalResult.reason };
  const breakdown = buildAnalysisBreakdown(obSignal, tapeSignal, candlesSignal, breakdownInput);
  (breakdown as any).multiTF = { ...mtfResults, alignCount: mtfAlignCount };
  (breakdown as any).tapeWindows = tapeWindowResults;
  (breakdown as any).volatilityMultiplier = volatilityMultiplier; // Sinclair: уменьшить размер при высокой волатильности

  const macd = candles5m.length ? candleAnalyzer.getMACD(candles5m.map((c) => c.close)) : null;
  const bb = candles5m.length ? candleAnalyzer.getBollingerBands(candles5m.map((c) => c.close)) : null;

  // Schwager: направление цены для detectFailedSignalHint (последние 5 свечей 5m)
  const priceDirection: 'up' | 'down' =
    candles5m.length >= 5
      ? candles5m[candles5m.length - 1].close >= candles5m[candles5m.length - 5].close
        ? 'up'
        : 'down'
      : 'up';

  let signal = signalGenerator.generateSignal({
    symbol: sym.replace('-', '/'),
    exchange: 'OKX',
    direction,
    entryPrice,
    patterns: patterns.length ? patterns : ['none'],
    rsi: rsi ?? undefined,
    confidence,
    timeframe,
    mode,
    atr: atr ?? undefined,
    priceDirection,
    falseBreakoutRisk: falseBreakoutHint
  });
  const mlFeatures = {
    confidence: signal.confidence ?? 0,
    direction: direction === 'LONG' ? 1 : 0,
    riskReward: signal.risk_reward ?? 1,
    triggersCount: (signal.triggers ?? []).length,
    rsiBucket: rsi != null ? (rsi < 35 ? 1 : rsi > 65 ? -1 : 0) : undefined,
    volumeConfirm: candlesSignal.volumeConfirm ? 1 : 0
  };
  signal = {
    ...signal,
    confidence: Math.round(adjustConfidence(signal.confidence ?? 0, mlFeatures) * 100) / 100
  };
  if (!opts?.silent) {
    addSignal(signal);
    getBroadcastSignal()?.(signal, breakdown);
  }
  return { signal, analysis: { patterns, rsi, macd: macd ?? undefined, bb: bb ?? undefined }, breakdown };
}

/** Проверка данных OKX перед анализом */
router.get('/analysis-preview/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol || 'BTC-USDT').replace(/_/g, '-');
    const timeframe = (req.query.timeframe as string) || '5m';
    const sym = symbol.replace(/_/g, '-');
    const [candles, orderBook, trades] = await Promise.all([
      aggregator.getOHLCV(sym, timeframe, 200),
      aggregator.getOrderBook(sym, 400),
      aggregator.getTrades(sym, 100)
    ]);
    const bestBid = orderBook.bids?.[0]?.[0];
    const bestAsk = orderBook.asks?.[0]?.[0];
    res.json({
      ok: true,
      symbol: sym,
      exchange: 'OKX',
      data: {
        candles: { count: candles.length, latest: candles[candles.length - 1] },
        orderBook: { bidsCount: orderBook.bids?.length ?? 0, asksCount: orderBook.asks?.length ?? 0, spread: bestBid && bestAsk ? ((bestAsk - bestBid) / ((bestBid + bestAsk) / 2) * 100).toFixed(4) + '%' : null },
        trades: { count: trades.length, sample: trades.slice(0, 3) }
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

router.post('/analyze/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol || 'BTC-USDT').replace(/_/g, '-');
    const timeframe = (req.body?.timeframe as string) || '5m';
    const result = await runAnalysis(symbol, timeframe);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

const MAX_SYMBOLS = 5;
/** Сигналы 85%+ дают лучший результат — мин. порог 82% для авто-цикла */
const AUTO_MIN_CONFIDENCE = 0.82;
const AUTO_SCORE_WEIGHTS = { confidence: 0.5, riskReward: 0.35, confluence: 0.15 };

/** Преобразовать символ из скринера (BTC/USDT:USDT) в формат runAnalysis (BTC-USDT) */
function scannerSymbolToMarket(s: string): string {
  const base = s.split('/')[0]?.toUpperCase() || s;
  return base.includes('-') ? base : `${base}-USDT`;
}

/**
 * Полностью автоматический цикл: анализ всех пар, выбор лучшего сигнала.
 * Если useScanner === true — сначала получаем топ монет из скринера (волатильность, объём, BB squeeze).
 * TP/SL, leverage, mode — определяются по анализу (ATR, волатильность, confluence).
 */
async function runAutoTradingBestCycle(symbols: string[], timeframe = '5m', useScanner = false): Promise<void> {
  let syms = symbols.slice(0, MAX_SYMBOLS);
  if (useScanner) {
    try {
      const { CoinScanner } = await import('../services/coinScanner');
      const scanner = new CoinScanner();
      const defaultSymbols = CoinScanner.getDefaultSymbols();
      const topCoins = await scanner.getTopCandidates(defaultSymbols, MAX_SYMBOLS, {
        minVolume24h: 500_000,
        minVolatility24h: 4,
        checkBBSqueeze: true,
        checkMomentum: true
      });
      const fromScanner = topCoins.map((c) => scannerSymbolToMarket(c.symbol)).filter(Boolean);
      if (fromScanner.length > 0) syms = fromScanner;
      else logger.warn('runAutoTradingBestCycle', 'Scanner returned no coins, using fallback symbols');
    } catch (e) {
      logger.warn('runAutoTradingBestCycle', (e as Error).message, { useScanner: true });
    }
  }
  if (syms.length === 0) syms = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];

  const results: Array<{ signal: Awaited<ReturnType<typeof runAnalysis>>['signal']; breakdown: any; score: number }> = [];
  await Promise.all(
    syms.map(async (sym) => {
      try {
        const r = await runAnalysis(sym, timeframe, 'futures25x', { silent: true });
        const sig = r.signal;
        const conf = sig.confidence ?? 0;
        const rr = sig.risk_reward ?? 1;
        const alignCount = (r.breakdown as any)?.multiTF?.alignCount ?? 0;
        const confluenceBonus = Math.min(1.2, 0.9 + alignCount * 0.06);
        if (conf >= AUTO_MIN_CONFIDENCE) {
          const score =
            conf * AUTO_SCORE_WEIGHTS.confidence +
            Math.min(rr / 3, 1) * AUTO_SCORE_WEIGHTS.riskReward +
            confluenceBonus * AUTO_SCORE_WEIGHTS.confluence;
          results.push({ signal: sig, breakdown: r.breakdown, score });
        }
      } catch (e) {
        logger.warn('runAutoTradingBestCycle', (e as Error).message, { symbol: sym });
      }
    })
  );
  if (results.length === 0) return;
  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  addSignal(best.signal);
  (best.breakdown as any).autoSettings = { leverage: autoAnalyzeLeverage, sizePercent: autoAnalyzeSizePercent, minConfidence: 82 };
  getBroadcastSignal()?.(best.signal, best.breakdown);
  logger.info('runAutoTradingBestCycle', `Best: ${best.signal.symbol} ${best.signal.direction} conf=${((best.signal.confidence ?? 0) * 100).toFixed(0)}% score=${best.score.toFixed(3)}`);

  if (config.autoTradingExecutionEnabled && autoAnalyzeExecuteOrders && config.okx.hasCredentials) {
    executeSignal(best.signal, {
      sizePercent: autoAnalyzeSizePercent,
      leverage: autoAnalyzeLeverage,
      maxPositions: autoAnalyzeMaxPositions,
      useTestnet: autoAnalyzeUseTestnet
    }).then((result) => {
      if (result.ok) {
        logger.info('runAutoTradingBestCycle', `OKX order placed: ${result.orderId}`);
      } else {
        logger.warn('runAutoTradingBestCycle', `OKX execution skipped: ${result.error}`);
      }
    }).catch((e) => logger.error('runAutoTradingBestCycle', 'OKX execute failed', { error: (e as Error).message }));
  }
}

router.post('/auto-analyze/start', (req, res) => {
  if (autoAnalyzeTimer) {
    res.json({ status: 'already_running' });
    return;
  }
  const symbolsRaw = req.body?.symbols ?? req.body?.symbol;
  const symbols: string[] = Array.isArray(symbolsRaw)
    ? symbolsRaw.slice(0, MAX_SYMBOLS).map((s: string) => String(s || '').replace(/_/g, '-')).filter(Boolean)
    : [String(symbolsRaw || 'BTC-USDT').replace(/_/g, '-')];
  const syms = [...new Set(symbols)].slice(0, MAX_SYMBOLS);
  if (syms.length === 0) syms.push('BTC-USDT');
  const timeframe = (req.body?.timeframe as string) || '5m';
  const mode = (req.body?.mode as string) || 'default';
  const intervalMs = Math.max(30000, Math.min(300000, parseInt(String(req.body?.intervalMs)) || 60000));
  const fullAuto = Boolean(req.body?.fullAuto);
  const useScanner = Boolean(req.body?.useScanner);
  const executeOrders = Boolean(req.body?.executeOrders);
  const useTestnet = req.body?.useTestnet !== false;
  const maxPositions = Math.max(1, Math.min(10, parseInt(String(req.body?.maxPositions)) || 2));
  const sizePercent = Math.max(1, Math.min(50, parseInt(String(req.body?.sizePercent)) || 5));
  const leverage = Math.max(1, Math.min(125, parseInt(String(req.body?.leverage)) || 25));

  autoAnalyzeExecuteOrders = fullAuto && executeOrders;
  autoAnalyzeUseTestnet = useTestnet;
  autoAnalyzeMaxPositions = maxPositions;
  autoAnalyzeSizePercent = sizePercent;
  autoAnalyzeLeverage = leverage;

  const runAll = () => {
    if (fullAuto) {
      runAutoTradingBestCycle(syms, timeframe, useScanner).catch((e) => logger.error('auto-analyze', (e as Error).message));
    } else {
      for (const sym of syms) {
        runAnalysis(sym, timeframe, mode).catch((e) => logger.error('auto-analyze', (e as Error).message));
      }
    }
  };
  runAll();
  autoAnalyzeTimer = setInterval(runAll, intervalMs);
  res.json({
    status: 'started',
    symbols: syms,
    timeframe,
    intervalMs,
    mode,
    fullAuto,
    useScanner: fullAuto ? useScanner : undefined,
    executeOrders: fullAuto ? autoAnalyzeExecuteOrders : undefined,
    useTestnet: fullAuto ? autoAnalyzeUseTestnet : undefined
  });
});

export function stopAutoAnalyze(): void {
  if (autoAnalyzeTimer) {
    clearInterval(autoAnalyzeTimer);
    autoAnalyzeTimer = null;
  }
}

router.post('/auto-analyze/stop', (_req, res) => {
  stopAutoAnalyze();
  res.json({ status: 'stopped' });
});

export function getAutoAnalyzeStatus(): { running: boolean } {
  return { running: !!autoAnalyzeTimer };
}

router.get('/auto-analyze/status', (_req, res) => {
  res.json(getAutoAnalyzeStatus());
});

/** Тестовый сигнал для проверки потока (демо). Не исполняется на OKX. */
router.post('/test-signal', (req, res) => {
  try {
    const symbol = (req.body?.symbol as string) || 'BTC-USDT';
    const direction = (req.body?.direction as 'LONG' | 'SHORT') || 'LONG';
    const entryPrice = Number(req.body?.entryPrice) || 97000;
    const slPct = 0.01;
    const tpPct = 0.02;
    const stopLoss = direction === 'LONG' ? entryPrice * (1 - slPct) : entryPrice * (1 + slPct);
    const takeProfit1 = direction === 'LONG' ? entryPrice * (1 + tpPct) : entryPrice * (1 - tpPct);
    const signal: import('../types/signal').TradingSignal = {
      id: `sig_test_${Date.now()}`,
      timestamp: new Date().toISOString(),
      symbol: symbol.replace('_', '-'),
      exchange: 'OKX',
      direction,
      entry_price: entryPrice,
      stop_loss: stopLoss,
      take_profit: [takeProfit1, takeProfit1 * (direction === 'LONG' ? 1.02 : 0.98)],
      risk_reward: 2,
      confidence: 0.92,
      timeframe: '5m',
      triggers: ['test_signal'],
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      trailing_stop_config: {
        initial_stop: stopLoss,
        trail_step_pct: 0.003,
        activation_profit_pct: 0.01
      }
    };
    addSignal(signal);
    getBroadcastSignal()?.(signal, { autoSettings: { test: true } });
    res.json({ ok: true, signal });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PNL калькулятор — расчёт прибыли/убытка, ROE, объёма позиции, ликвидации (freqtrade formula + buffer) */
router.post('/pnl-calc', (req, res) => {
  try {
    const { direction, entryPrice, exitPrice, margin, leverage, usdRubRate } = req.body || {};
    const dir = (direction || 'LONG').toUpperCase() as 'LONG' | 'SHORT';
    const entry = Number(entryPrice) || 0;
    const exit = Number(exitPrice) || 0;
    const marg = Number(margin) || 0;
    const lev = Math.max(1, Math.min(125, Number(leverage) || 1));
    const rubRate = Number(usdRubRate) || 100;

    if (entry <= 0 || marg <= 0) {
      return res.status(400).json({ error: 'entryPrice и margin должны быть > 0' });
    }

    const positionVolume = marg * lev;
    let pnlUsd: number;
    if (dir === 'LONG') {
      pnlUsd = positionVolume * (exit - entry) / entry;
    } else {
      pnlUsd = positionVolume * (entry - exit) / entry;
    }
    const roe = marg > 0 ? (pnlUsd / marg) * 100 : 0;
    const liquidationPrice = calcLiquidationPrice(entry, lev, dir);

    const liqSimple = calcLiquidationPriceSimple(entry, lev, dir);
    res.json({
      pnlUsd: Math.round(pnlUsd * 100) / 100,
      pnlRub: Math.round(pnlUsd * rubRate * 100) / 100,
      roe: Math.round(roe * 100) / 100,
      positionVolume: Math.round(positionVolume * 100) / 100,
      liquidationPrice: Math.round(liquidationPrice * 100) / 100,
      liquidationPriceSimple: Math.round(liqSimple * 100) / 100,
      status: pnlUsd >= 0 ? 'PROFIT' : 'LOSS',
      direction: dir,
      currency: 'USD'
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Анализ сигналов за период (например «за ночь») — статистика и рекомендации для корректного открытия */
router.get('/signals-night', (req, res) => {
  try {
    const hours = Math.min(168, Math.max(1, parseInt(String(req.query.hours)) || 12));
    const limit = Math.min(500, parseInt(String(req.query.limit)) || 200);
    const signals = getSignalsSince(hours, limit);

    const longSignals = signals.filter((s) => s.direction === 'LONG');
    const shortSignals = signals.filter((s) => s.direction === 'SHORT');
    const avgConfidence = signals.length
      ? signals.reduce((a, s) => a + (s.confidence ?? 0), 0) / signals.length
      : 0;
    const bySymbol: Record<string, { long: number; short: number; avgConf: number }> = {};
    for (const s of signals) {
      const sym = s.symbol || 'unknown';
      if (!bySymbol[sym]) bySymbol[sym] = { long: 0, short: 0, avgConf: 0 };
      if (s.direction === 'LONG') bySymbol[sym].long++;
      else bySymbol[sym].short++;
      bySymbol[sym].avgConf = (bySymbol[sym].avgConf * (bySymbol[sym].long + bySymbol[sym].short - 1) + (s.confidence ?? 0)) / (bySymbol[sym].long + bySymbol[sym].short);
    }

    const highConf = signals.filter((s) => (s.confidence ?? 0) >= 0.82).length;
    const lowConf = signals.filter((s) => (s.confidence ?? 0) < 0.6).length;

    const suggestions: string[] = [];
    if (signals.length > 0) {
      if (avgConfidence < 0.72) suggestions.push('Повысить минимальный порог confidence для авто-входа (рекомендуется ≥ 82%).');
      if (lowConf > 0) suggestions.push('Часть сигналов имела низкую уверенность — не открывать сделки при confidence < 60%.');
      if (highConf < signals.length * 0.5) suggestions.push('Мало сигналов с высокой уверенностью — дождаться конfluence 3/3 или 4+ таймфреймов.');
      if (longSignals.length > 0 && shortSignals.length > 0) suggestions.push('И LONG, и SHORT за период — учитывать HTF и не входить против старшего тренда.');
    }

    res.json({
      periodHours: hours,
      total: signals.length,
      long: longSignals.length,
      short: shortSignals.length,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      highConfidenceCount: highConf,
      lowConfidenceCount: lowConf,
      bySymbol,
      signals: signals.slice(0, 50),
      suggestions
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Анализ закрытых сделок за ночь: обновление ML и рекомендации по корректному открытию */
router.post('/analyze-trades', (req, res) => {
  try {
    const body = req.body || {};
    const trades = Array.isArray(body.trades) ? body.trades : [];
    let wins = 0;
    let losses = 0;
    const byDirection: { LONG: { win: number; loss: number }; SHORT: { win: number; loss: number } } = {
      LONG: { win: 0, loss: 0 },
      SHORT: { win: 0, loss: 0 }
    };

    for (const t of trades) {
      const pnl = Number(t.pnl) ?? 0;
      const win = pnl > 0;
      if (win) wins++;
      else losses++;

      const direction = (t.direction || 'LONG').toUpperCase() as 'LONG' | 'SHORT';
      if (win) byDirection[direction].win++;
      else byDirection[direction].loss++;

      const features = {
        confidence: Number(t.confidence) ?? 0.7,
        direction: direction === 'LONG' ? 1 : 0,
        riskReward: Number(t.riskReward) ?? 2,
        triggersCount: Array.isArray(t.triggers) ? t.triggers.length : 0,
        rsiBucket: t.rsi != null ? (Number(t.rsi) < 30 ? 1 : Number(t.rsi) > 70 ? -1 : 0) : undefined,
        volumeConfirm: t.volumeConfirm === true ? 1 : t.volumeConfirm === false ? 0 : undefined
      };
      mlUpdate(features, win);
    }

    const total = wins + losses;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const longWinRate = byDirection.LONG.win + byDirection.LONG.loss > 0
      ? (byDirection.LONG.win / (byDirection.LONG.win + byDirection.LONG.loss)) * 100
      : null;
    const shortWinRate = byDirection.SHORT.win + byDirection.SHORT.loss > 0
      ? (byDirection.SHORT.win / (byDirection.SHORT.win + byDirection.SHORT.loss)) * 100
      : null;

    const suggestions: string[] = [];
    if (total > 0) {
      if (winRate < 50) suggestions.push('Общий Win Rate < 50% — повысить min confidence до 85% или реже входить при конфликте компонентов.');
      if (longWinRate != null && longWinRate < 45) suggestions.push('LONG сделки показывают низкий Win Rate — усилить фильтр по HTF и объёму перед входом в LONG.');
      if (shortWinRate != null && shortWinRate > 55) suggestions.push('SHORT сделки работают лучше — при равном confluence можно предпочитать SHORT.');
      if (total >= 5) suggestions.push('Модель ML обновлена по исходам — следующие сигналы будут скорректированы с учётом истории.');
    }

    logger.info('analyze-trades', `Processed ${total} trades, wins=${wins}, winRate=${winRate.toFixed(0)}%`);

    res.json({
      ok: true,
      processed: total,
      wins,
      losses,
      winRatePct: Math.round(winRate * 10) / 10,
      byDirection: { LONG: byDirection.LONG, SHORT: byDirection.SHORT, longWinRatePct: longWinRate != null ? Math.round(longWinRate * 10) / 10 : null, shortWinRatePct: shortWinRate != null ? Math.round(shortWinRate * 10) / 10 : null },
      suggestions
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
