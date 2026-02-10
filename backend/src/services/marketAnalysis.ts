/**
 * Market Analysis — OKX: Стакан + Лента + Свечи
 * Crypto_Scalping_Guide_v2.pdf + guid.md + imgg
 * Schwager: объём при пробое >= VOLUME_BREAKOUT_MULTIPLIER × средний
 * Веса: Стакан 40%, Лента 35%, Свечи 25%
 * Confluence: >= 2 компонента согласны, Confidence >= 60%, R:R >= 1.5, Spread < 0.1%
 */

import { OHLCVCandle } from '../types/candle';
import { VOLUME_BREAKOUT_MULTIPLIER } from '../lib/tradingPrinciples';

const WEIGHT_ORDERBOOK = 0.4;
const WEIGHT_TAPE = 0.35;
const WEIGHT_CANDLES = 0.25;

/** PDF: пороги спреда — < 0.05% ликвидность хорошая, > 0.1% осторожно */
export const SPREAD_GOOD_PCT = 0.05;
export const SPREAD_CAUTION_PCT = 0.1;

/** PDF: Trade classification (USDT) — вес по типу сделки */
const TAPE_SMALL = 1000;   // < $1K x1
const TAPE_MEDIUM = 10000; // $1K-$10K x2
const TAPE_LARGE = 50000;  // $10K-$50K x5, > $50K x10

export interface OrderBookInput {
  bids: [number, number][];
  asks: [number, number][];
}

export interface TradeInput {
  price: number;
  amount: number;
  time: number;
  isBuy: boolean;
  quoteQuantity?: number;
}

export interface AnalysisSignals {
  candles: { direction: 'LONG' | 'SHORT' | 'NEUTRAL'; score: number };
  orderBook: { direction: 'LONG' | 'SHORT' | 'NEUTRAL'; score: number; spreadPct?: number };
  tape: { direction: 'LONG' | 'SHORT' | 'NEUTRAL'; score: number };
}

/** Детальный breakdown для UI и прогноза */
export interface AnalysisBreakdown {
  orderBook: { direction: string; score: number; domScore: number; imbalance: number; spreadPct: number; wallsBid: number; wallsAsk: number };
  tape: { direction: string; score: number; delta: number; cvdDivergence: 'bullish' | 'bearish' | null };
  candles: { direction: string; score: number; patterns: string[]; rsi: number | null; emaTrend: 'bullish' | 'bearish' | null };
  confluence: { count: number; direction: string | null; confidence: number };
  forecast: { direction: 'LONG' | 'SHORT' | null; confidence: number; reason: string };
  multiTF?: { '1m'?: { direction: string; score: number }; '5m'?: { direction: string; score: number }; '15m'?: { direction: string; score: number }; '1h'?: { direction: string; score: number }; '1d'?: { direction: string; score: number }; alignCount: number };
}

function sumVolumeInRange(
  levels: [number, number][],
  midPrice: number,
  percentRange: number
): number {
  const threshold = midPrice * (percentRange / 100);
  return levels
    .filter(([p]) => Math.abs(p - midPrice) <= threshold)
    .reduce((s, [, a]) => s + a, 0);
}

/** DOM_Score по guid.md: (Bid_1% - Ask_1%) / (Bid + Ask), >0.3 Bull, <-0.3 Bear */
function calcDomScore(bids: [number, number][], asks: [number, number][], midPrice: number): number {
  const bid1 = sumVolumeInRange(bids, midPrice, 1);
  const ask1 = sumVolumeInRange(asks, midPrice, 1);
  const total = bid1 + ask1;
  return total > 0 ? (bid1 - ask1) / total : 0;
}

/** PDF: Wall = Quantity > AvgQuantity * 3 — стенка на BID = поддержка, на ASK = сопротивление */
function countWalls(levels: [number, number][], midPrice: number, percentRange: number): number {
  const inRange = levels.filter(([p]) => Math.abs(p - midPrice) / midPrice <= percentRange / 100);
  if (inRange.length < 3) return 0;
  const qtys = inRange.map(([, q]) => q);
  const avgQty = qtys.reduce((a, b) => a + b, 0) / qtys.length;
  const wallThreshold = avgQty * 3;
  return inRange.filter(([, q]) => q > wallThreshold).length;
}

/** Результат анализа стакана с метриками для breakdown */
export interface OrderBookResult {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  score: number;
  spreadPct: number;
  domScore: number;
  imbalance: number;
  bidWalls: number;
  askWalls: number;
}

/** Анализ стакана OKX (400 уровней) — DOM_Score, зоны, давление, спред, стенки */
export function analyzeOrderBook(ob: OrderBookInput): OrderBookResult {
  const bids = ob.bids || [];
  const asks = ob.asks || [];
  if (bids.length === 0 || asks.length === 0) {
    return { direction: 'NEUTRAL', score: 0, spreadPct: 999, domScore: 0, imbalance: 0, bidWalls: 0, askWalls: 0 };
  }

  const bestBid = bids[0][0];
  const bestAsk = asks[0][0];
  const midPrice = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;
  const spreadPct = (spread / midPrice) * 100;

  let bullishScore = 0;
  let bearishScore = 0;

  // 1. DOM_Score (guid/PDF): >0.3 Bull, <-0.3 Bear
  const domScore = calcDomScore(bids, asks, midPrice);
  if (domScore > 0.3) bullishScore += 3;
  else if (domScore > 0.2) bullishScore += 2;
  else if (domScore > 0.1) bullishScore += 1;
  if (domScore < -0.3) bearishScore += 3;
  else if (domScore < -0.2) bearishScore += 2;
  else if (domScore < -0.1) bearishScore += 1;

  // 2. Общий дисбаланс Imbalance = (BID-ASK)/(BID+ASK)
  const totalBid = bids.reduce((s, [, a]) => s + a, 0);
  const totalAsk = asks.reduce((s, [, a]) => s + a, 0);
  const totalVol = totalBid + totalAsk;
  if (totalVol > 0) {
    const imbalance = (totalBid - totalAsk) / totalVol;
    if (imbalance > 0.3) bullishScore += 2;
    else if (imbalance > 0.2) bullishScore += 1;
    if (imbalance < -0.3) bearishScore += 2;
    else if (imbalance < -0.2) bearishScore += 1;
  }

  // 3. Зоны (0.05%, 0.1%, 0.2%, 0.5%, 1%)
  const zones = [0.05, 0.1, 0.2, 0.5, 1];
  for (const zone of zones) {
    const bidDepth = sumVolumeInRange(bids, midPrice, zone);
    const askDepth = sumVolumeInRange(asks, midPrice, zone);
    const zoneTotal = bidDepth + askDepth;
    if (zoneTotal > 0) {
      const zoneImb = (bidDepth - askDepth) / zoneTotal;
      if (zoneImb > 0.3) bullishScore += 1;
      if (zoneImb < -0.3) bearishScore += 1;
    }
  }

  // 4. Pressure = SUM(Qty * e^(-distance*100)) — PDF формула, BuyPressure > 60%
  let bidWeight = 0;
  let askWeight = 0;
  for (const [price, qty] of bids.slice(0, 100)) {
    const dist = Math.abs((midPrice - price) / midPrice);
    bidWeight += qty * Math.exp(-dist * 100);
  }
  for (const [price, qty] of asks.slice(0, 100)) {
    const dist = Math.abs((price - midPrice) / midPrice);
    askWeight += qty * Math.exp(-dist * 100);
  }
  const pressureTotal = bidWeight + askWeight;
  if (pressureTotal > 0) {
    const buyPct = (bidWeight / pressureTotal) * 100;
    const sellPct = (askWeight / pressureTotal) * 100;
    if (buyPct > 60) bullishScore += 2;
    if (sellPct > 60) bearishScore += 2;
  }

  // 5. Wall detection — PDF: стенка на BID = поддержка, на ASK = сопротивление
  const bidWalls = countWalls(bids, midPrice, 1);
  const askWalls = countWalls(asks, midPrice, 1);
  if (bidWalls > askWalls && bidWalls > 0) bullishScore += 2;
  if (askWalls > bidWalls && askWalls > 0) bearishScore += 2;

  // 6. Сжатие спреда — предвестник импульса
  if (spreadPct < 0.05 && totalVol > 0) {
    if (domScore > 0.15) bullishScore += 1;
    if (domScore < -0.15) bearishScore += 1;
  }

  const totalScore = bullishScore + bearishScore;
  const confidence = totalScore > 0 ? (Math.abs(bullishScore - bearishScore) / totalScore) * 100 : 0;

  let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (bullishScore > bearishScore * 1.3 && confidence > 25) direction = 'LONG';
  else if (bearishScore > bullishScore * 1.3 && confidence > 25) direction = 'SHORT';

  const imbalance = totalVol > 0 ? (totalBid - totalAsk) / totalVol : 0;
  return {
    direction,
    score: Math.max(bullishScore, bearishScore),
    spreadPct,
    domScore,
    imbalance,
    bidWalls,
    askWalls
  };
}

/** Давление стакана на пробой уровня (MaksBaks: стакан подтверждает пробой) */
export function detectBreakoutPressure(
  ob: OrderBookInput,
  level: number,
  direction: 'up' | 'down'
): { pressure: number; confidence: number } {
  const bids = ob.bids || [];
  const asks = ob.asks || [];
  if (!bids.length || !asks.length) return { pressure: 1, confidence: 0.5 };
  const threshold = level * 0.005;
  const bidVol = bids.filter(([p]) => Math.abs(p - level) <= threshold).reduce((s, [, a]) => s + a, 0);
  const askVol = asks.filter(([p]) => Math.abs(p - level) <= threshold).reduce((s, [, a]) => s + a, 0);
  const total = bidVol + askVol;
  if (total <= 0) return { pressure: 1, confidence: 0.5 };
  if (direction === 'up') {
    const pressure = askVol > 0 ? bidVol / askVol : 2;
    return { pressure, confidence: pressure >= 2 ? 0.8 : pressure >= 1.2 ? 0.6 : 0.5 };
  } else {
    const pressure = bidVol > 0 ? askVol / bidVol : 2;
    return { pressure, confidence: pressure >= 2 ? 0.8 : pressure >= 1.2 ? 0.6 : 0.5 };
  }
}

/** PDF: вес сделки по объёму USDT — SMALL x1, MEDIUM x2, LARGE x5, WHALE x10 */
function tradeWeight(quoteUsdt: number): number {
  if (quoteUsdt >= TAPE_LARGE) return 10;
  if (quoteUsdt >= TAPE_MEDIUM) return 5;
  if (quoteUsdt >= TAPE_SMALL) return 2;
  return 1;
}

/** Результат анализа ленты */
export interface TapeResult {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  score: number;
  delta: number;
  cvdDivergence: 'bullish' | 'bearish' | null;
  /** Дельта по последним 50% сделок — «настоящее» важнее (guid.md) */
  recentDelta?: number;
}

/** Анализ ленты OKX (100 сделок) — Delta, CVD, агрессия, классификация по размеру */
export function analyzeTape(trades: TradeInput[]): TapeResult {
  if (!trades.length) return { direction: 'NEUTRAL', score: 0, delta: 0, cvdDivergence: null };

  const sorted = [...trades].sort((a, b) => a.time - b.time);

  let buyVolume = 0;
  let sellVolume = 0;
  let buyWeighted = 0;
  let sellWeighted = 0;
  let buyAggr = 0;
  let sellAggr = 0;
  const cvdSteps: number[] = [];
  const prices: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const qty = t.quoteQuantity ?? t.price * t.amount;
    const w = tradeWeight(qty);
    if (t.isBuy) {
      buyVolume += qty;
      buyWeighted += qty * w;
      if (i > 0 && t.price >= sorted[i - 1].price) buyAggr += qty;
    } else {
      sellVolume += qty;
      sellWeighted += qty * w;
      if (i > 0 && t.price <= sorted[i - 1].price) sellAggr += qty;
    }
    cvdSteps.push(t.isBuy ? qty : -qty);
    prices.push(t.price);
  }

  let bullishScore = 0;
  let bearishScore = 0;
  let cvdDivergence: 'bullish' | 'bearish' | null = null;

  // 1. Volume Delta — PDF: |Delta%| > 20% = сильный сигнал
  const totalVol = buyVolume + sellVolume;
  const delta = totalVol > 0 ? (buyVolume - sellVolume) / totalVol : 0;
  if (totalVol > 0) {
    if (delta > 0.2) bullishScore += 3;
    else if (delta > 0.1) bullishScore += 2;
    if (delta < -0.2) bearishScore += 3;
    else if (delta < -0.1) bearishScore += 2;
  }

  // 2. Weighted Delta (SMALL x1, MEDIUM x2, LARGE x5, WHALE x10)
  const totalWeighted = buyWeighted + sellWeighted;
  if (totalWeighted > 0) {
    const wDelta = (buyWeighted - sellWeighted) / totalWeighted;
    if (wDelta > 0.25) bullishScore += 2;
    if (wDelta < -0.25) bearishScore += 2;
  }

  // 3. CVD Divergence — PDF: сильнейший сигнал! Цена растёт + CVD падает = медвежья, и наоборот
  if (sorted.length >= 10 && prices.length >= 10) {
    const priceFirst = prices.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const priceLast = prices.slice(-5).reduce((a, b) => a + b, 0) / 5;
    let cvdFirst = 0;
    for (let i = 0; i < 5; i++) cvdFirst += cvdSteps[i];
    let cvdLast = 0;
    for (let i = sorted.length - 5; i < sorted.length; i++) cvdLast += cvdSteps[i];
    const priceUp = priceLast > priceFirst * 1.001;
    const priceDown = priceLast < priceFirst * 0.999;
    const cvdUp = cvdLast > cvdFirst;
    const cvdDown = cvdLast < cvdFirst;
    if (priceUp && cvdDown) {
      bearishScore += 4;
      cvdDivergence = 'bearish';
    }
    if (priceDown && cvdUp) {
      bullishScore += 4;
      cvdDivergence = 'bullish';
    }
  }

  // 4. Агрессия (сделки против цены)
  const aggTotal = buyAggr + sellAggr;
  if (aggTotal > 0) {
    const buyAggPct = (buyAggr / aggTotal) * 100;
    const sellAggPct = (sellAggr / aggTotal) * 100;
    if (buyAggPct > 65) bullishScore += 2;
    if (sellAggPct > 65) bearishScore += 2;
  }

  // 5. Крупные сделки WHALE/LARGE
  if (sorted.length > 5) {
    let bigBuy = 0;
    let bigSell = 0;
    for (const t of sorted) {
      const qty = t.quoteQuantity ?? t.price * t.amount;
      if (qty >= TAPE_SMALL) {
        if (t.isBuy) bigBuy += qty * tradeWeight(qty);
        else bigSell += qty * tradeWeight(qty);
      }
    }
    const bigTotal = bigBuy + bigSell;
    if (bigTotal > 0) {
      if (bigBuy > bigSell * 1.3) bullishScore += 2;
      if (bigSell > bigBuy * 1.3) bearishScore += 2;
    }
  }

  // 6. Соотношение количества сделок
  if (sorted.length > 10) {
    const buyCount = sorted.filter((t) => t.isBuy).length;
    const sellCount = sorted.length - buyCount;
    if (buyCount > sellCount * 1.3) bullishScore += 1;
    if (sellCount > buyCount * 1.3) bearishScore += 1;
  }

  // Recent delta — последние 50% сделок (guid: Present важнее Past)
  let recentDelta = 0;
  if (sorted.length >= 10) {
    const half = Math.floor(sorted.length / 2);
    let recentBuy = 0;
    let recentSell = 0;
    for (let i = half; i < sorted.length; i++) {
      const t = sorted[i];
      const qty = t.quoteQuantity ?? t.price * t.amount;
      if (t.isBuy) recentBuy += qty;
      else recentSell += qty;
    }
    const recentTotal = recentBuy + recentSell;
    recentDelta = recentTotal > 0 ? (recentBuy - recentSell) / recentTotal : 0;
  }

  const totalScore = bullishScore + bearishScore;
  const confidence = totalScore > 0 ? (Math.abs(bullishScore - bearishScore) / totalScore) * 100 : 0;

  let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (bullishScore > bearishScore * 1.3 && confidence > 25) direction = 'LONG';
  else if (bearishScore > bullishScore * 1.3 && confidence > 25) direction = 'SHORT';

  return { direction, score: Math.max(bullishScore, bearishScore), delta, cvdDivergence, recentDelta };
}

/** PDF: надёжность паттернов — Engulfing 75%, Morning/Evening Star 80%, Hammer 60-65%, 3 Soldiers/Crows 75% */
const PATTERN_WEIGHTS: Record<string, { bull: number; bear: number }> = {
  bullish_engulfing: { bull: 3, bear: 0 },
  bearish_engulfing: { bull: 0, bear: 3 },
  morning_star: { bull: 3, bear: 0 },
  evening_star: { bull: 0, bear: 3 },
  hammer: { bull: 2, bear: 0 },
  inverted_hammer: { bull: 2, bear: 0 },
  shooting_star: { bull: 0, bear: 2 },
  hanging_man: { bull: 0, bear: 2 },
  three_white_soldiers: { bull: 3, bear: 0 },
  three_black_crows: { bull: 0, bear: 3 },
  bull_marubozu: { bull: 2, bear: 0 },
  bear_marubozu: { bull: 0, bear: 2 },
  dragonfly_doji: { bull: 2, bear: 0 },
  gravestone_doji: { bull: 0, bear: 2 },
  tweezer_bottoms: { bull: 2, bear: 0 },
  tweezer_tops: { bull: 0, bear: 2 },
  bullish_harami: { bull: 1, bear: 0 },
  bearish_harami: { bull: 0, bear: 1 },
  piercing_line: { bull: 2, bear: 0 },
  dark_cloud_cover: { bull: 0, bear: 2 },
  doji: { bull: 1, bear: 1 },
  // Freqtrade-strategies: BinHV45, Cluc, HLHB, VolatilitySystem, Supertrend
  binhv45_lower_bb_reversal: { bull: 2, bear: 0 },
  cluc_low_volume_dip: { bull: 2, bear: 0 },
  hlhb_ema_rsi_cross: { bull: 2, bear: 0 },
  hlhb_ema_rsi_cross_bear: { bull: 0, bear: 2 },
  volatility_breakout: { bull: 2, bear: 0 },
  volatility_breakout_bear: { bull: 0, bear: 2 },
  adx_trend: { bull: 1, bear: 1 },
  emarsi_oversold: { bull: 2, bear: 0 },
  supertrend_up: { bull: 1, bear: 0 },
  supertrend_down: { bull: 0, bear: 1 }
};

export interface CandlesAnalysisInput {
  patterns: string[];
  rsi: number | null;
  macd: { histogram?: number } | null;
  bb: { lower?: number; upper?: number } | null;
  ema?: { ema9: number; ema21: number; ema50: number } | null;
  atr?: number | null;
  macdCrossover?: 'bullish' | 'bearish' | null;
}

/** Результат анализа свечей */
export interface CandlesResult {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  score: number;
  patterns: string[];
  rsi: number | null;
  emaTrend: 'bullish' | 'bearish' | null;
  volumeConfirm: boolean;  // объём выше среднего = подтверждение
  bbSqueeze: boolean;      // сужение BB = подготовка к пробою
  highVolatility?: boolean; // Antonopoulos: резкий дамп = возможно шум, не паниковать
}

/** Анализ свечей OKX (200 шт) — паттерны, RSI, MACD, BB, EMA, объём, BB squeeze */
export function analyzeCandles(
  candles: OHLCVCandle[],
  patterns: string[],
  rsi: number | null,
  macd: { histogram?: number } | null,
  bb: { lower?: number; upper?: number } | null,
  extra?: CandlesAnalysisInput & { bbWidth?: number; avgBbWidth?: number }
): CandlesResult {
  if (!candles.length) {
    return { direction: 'NEUTRAL', score: 0, patterns: [], rsi: null, emaTrend: null, volumeConfirm: false, bbSqueeze: false, highVolatility: false };
  }

  const lastCandle = candles[candles.length - 1];
  let bullishScore = 0;
  let bearishScore = 0;

  // Volume confirmation — объём выше среднего = сильнее сигнал (Schwager)
  const avgVol = candles.length >= 20
    ? candles.slice(-20).reduce((s, c) => s + (c.volume ?? 0), 0) / 20
    : lastCandle.volume ?? 0;
  const currentVol = lastCandle.volume ?? 0;
  const volumeConfirm = avgVol > 0 && currentVol > avgVol * VOLUME_BREAKOUT_MULTIPLIER;
  if (volumeConfirm) {
    const volDir = lastCandle.close >= lastCandle.open ? 1 : -1;
    if (volDir > 0) bullishScore += 1;
    else bearishScore += 1;
  }

  // Smart Volume Confirmation (generate-complete-guide): сила сигнала × прирост объёма
  const volumeWeight = avgVol > 0 ? Math.min(2, Math.max(0.5, currentVol / avgVol)) : 1;

  // Breakout + Volume Spike (Schwager): пробой на объёме > 1.5× предыдущей свечи
  const prevCandle = candles.length >= 2 ? candles[candles.length - 2] : null;
  const volSpike = prevCandle && (prevCandle.volume ?? 0) > 0
    ? currentVol > (prevCandle.volume ?? 0) * 1.5
    : false;
  if (volSpike) {
    const spikeDir = lastCandle.close >= lastCandle.open ? 1 : -1;
    if (spikeDir > 0) bullishScore += 1;
    else bearishScore += 1;
  }

  // BB Squeeze — сужение полос = подготовка к пробою (guid)
  const bbSqueeze = extra?.bbWidth != null && extra?.avgBbWidth != null && extra.avgBbWidth > 0
    ? extra.bbWidth < extra.avgBbWidth * 0.8
    : false;

  // 1. Паттерны с весами по надёжности (PDF)
  for (const p of patterns) {
    const w = PATTERN_WEIGHTS[p];
    if (w) {
      bullishScore += w.bull;
      bearishScore += w.bear;
    }
  }

  // 2. RSI — PDF: < 30 перепродан, > 70 перекуплен
  if (rsi != null) {
    if (rsi < 30) bullishScore += 2;
    else if (rsi < 40) bullishScore += 1;
    else if (rsi > 70) bearishScore += 2;
    else if (rsi > 60) bearishScore += 1;
  }

  // 3. MACD histogram + crossover
  if (macd?.histogram != null) {
    if (macd.histogram > 0) bullishScore += 1;
    else if (macd.histogram < 0) bearishScore += 1;
  }
  const crossover = extra?.macdCrossover;
  if (crossover === 'bullish') bullishScore += 2;
  if (crossover === 'bearish') bearishScore += 2;

  // 4. Bollinger Bands
  if (bb) {
    if (lastCandle.close < (bb.lower ?? 0)) bullishScore += 1;
    else if (lastCandle.close > (bb.upper ?? Infinity)) bearishScore += 1;
  }

  // 5. EMA trend — PDF: EMA(9) > EMA(21) > EMA(50) = сильный восходящий тренд
  const ema = extra?.ema;
  let emaTrend: 'bullish' | 'bearish' | null = null;
  if (ema) {
    if (ema.ema9 > ema.ema21 && ema.ema21 > ema.ema50) {
      bullishScore += 2;
      emaTrend = 'bullish';
    }
    if (ema.ema9 < ema.ema21 && ema.ema21 < ema.ema50) {
      bearishScore += 2;
      emaTrend = 'bearish';
    }
  }

  // 6. Объём свечей (VPA)
  const totalCandleVol = candles.reduce((s, c) => s + (c.volume ?? 0), 0);
  const buyVolCandles = candles.filter((c) => c.close >= c.open).reduce((s, c) => s + (c.volume ?? 0), 0);
  const sellVolCandles = totalCandleVol - buyVolCandles;
  if (totalCandleVol > 0) {
    const volRatio = (buyVolCandles - sellVolCandles) / totalCandleVol;
    if (volRatio > 0.15) bullishScore += 1;
    if (volRatio < -0.15) bearishScore += 1;
  }

  const totalScore = bullishScore + bearishScore;
  const confidence = totalScore > 0 ? (Math.abs(bullishScore - bearishScore) / totalScore) * 100 : 0;

  let direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (bullishScore > bearishScore * 1.3 && confidence > 25) direction = 'LONG';
  else if (bearishScore > bullishScore * 1.3 && confidence > 25) direction = 'SHORT';

  // Smart Volume Confirmation (generate-complete-guide): baseSignal * volumeWeight
  const score = Math.round(Math.max(bullishScore, bearishScore) * volumeWeight * 10) / 10;

  // Panic Noise (Antonopoulos): резкий диапазон свечи > 3% = высокая волатильность
  const lastRange = lastCandle.high - lastCandle.low;
  const highVolatility = lastCandle.close > 0 && lastRange / lastCandle.close > 0.03;

  return {
    direction,
    score,
    patterns: [...patterns].filter((p) => p && p !== 'none'),
    rsi,
    emaTrend,
    volumeConfirm,
    bbSqueeze,
    highVolatility
  };
}

/** Опции для глубокого анализа — достижение 80% уверенности */
export interface DeepAnalysisOptions {
  spreadPct?: number;
  riskReward?: number;
  volumeConfirm?: boolean;
  bbSqueeze?: boolean;
  tapeDelta?: number;      // для проверки силы противоречия ленты
  tapeRecentDelta?: number; // дельта последних 50% сделок (guid: Present важнее)
  obDomScore?: number;     // DOM score стакана
  cvdDivergence?: 'bullish' | 'bearish' | null;
  highVolatility?: boolean; // Antonopoulos: Panic Noise — снижение confidence при резком движении
  falseBreakoutHint?: boolean; // Nison: 24/7 крипто — пробой без объёма = возможный ложный пробой
}

/**
 * PDF: Confidence = Candles*0.25 + OrderBook*0.40 + Tape*0.35
 * Глубокий анализ: бонусы за Volume, BB Squeeze, 3/3 confluence, ослабление противоречивой ленты → 80%
 */
export function computeSignal(
  signals: AnalysisSignals,
  options?: DeepAnalysisOptions
): {
  direction: 'LONG' | 'SHORT' | null;
  confidence: number;
  confluence: boolean;
  reason?: string;
} {
  const { candles, orderBook, tape } = signals;
  const obDir = orderBook.direction;
  const tapeDir = tape.direction;
  const candlesDir = candles.direction;
  const spreadPct = options?.spreadPct ?? (orderBook as OrderBookResult).spreadPct ?? 0;
  const riskReward = options?.riskReward ?? 1.5;

  if (spreadPct > SPREAD_CAUTION_PCT) {
    return { direction: null, confidence: 0, confluence: false, reason: `spread ${spreadPct.toFixed(3)}% > ${SPREAD_CAUTION_PCT}%` };
  }

  const longCount = [obDir, tapeDir, candlesDir].filter((d) => d === 'LONG').length;
  const shortCount = [obDir, tapeDir, candlesDir].filter((d) => d === 'SHORT').length;
  const agreeLong = longCount >= 2;
  const agreeShort = shortCount >= 2;

  if (!agreeLong && !agreeShort) {
    return { direction: null, confidence: 0, confluence: false, reason: '< 2 components agree' };
  }

  const direction: 'LONG' | 'SHORT' = agreeLong ? 'LONG' : 'SHORT';

  // Ослабление веса ленты при противоречии: если лента 1/3 и её delta слабый (< 25%), считаем как 0.5x
  const tapeContradicts = (direction === 'SHORT' && tapeDir === 'LONG') || (direction === 'LONG' && tapeDir === 'SHORT');
  const tapeDelta = options?.tapeDelta ?? 0;
  const tapeDeltaWeak = Math.abs(tapeDelta) < 0.25;
  const tapeWeightAdj = tapeContradicts && tapeDeltaWeak ? 0.5 : 1;

  const weightedScore =
    orderBook.score * WEIGHT_ORDERBOOK +
    tape.score * WEIGHT_TAPE * tapeWeightAdj +
    candles.score * WEIGHT_CANDLES;

  // Базис: 0.62 + взвешенный скор (цель 80%). Немного консервативнее для 2/3 confluence
  let confidence = Math.min(0.92, 0.62 + weightedScore * 0.026);

  // Бонус 3/3 confluence: +10% — полное согласие = надёжнее
  if (longCount === 3 || shortCount === 3) {
    confidence = Math.min(0.95, confidence + 0.10);
  }

  // Бонус 2/3 confluence при сильном стакане/свечах: +4% (снижен с 5%)
  const obStrong = orderBook.score >= 6;
  const candlesStrong = candles.score >= 5;
  if ((longCount === 2 || shortCount === 2) && (obStrong || candlesStrong)) {
    const aligned = (direction === 'LONG' && (obDir === 'LONG' || candlesDir === 'LONG')) ||
      (direction === 'SHORT' && (obDir === 'SHORT' || candlesDir === 'SHORT'));
    if (aligned) confidence = Math.min(0.90, confidence + 0.04);
  }

  // CVD divergence в пользу направления — сильный сигнал (+5%)
  const cvd = options?.cvdDivergence;
  if (cvd === 'bearish' && direction === 'SHORT') confidence = Math.min(0.95, confidence + 0.05);
  if (cvd === 'bullish' && direction === 'LONG') confidence = Math.min(0.95, confidence + 0.05);

  // Recent tape flow (последние 50% сделок) совпадает с направлением — +4%
  const recentDelta = options?.tapeRecentDelta;
  if (recentDelta != null && Math.abs(recentDelta) > 0.15) {
    const recentAlign = (direction === 'SHORT' && recentDelta < -0.15) || (direction === 'LONG' && recentDelta > 0.15);
    if (recentAlign) confidence = Math.min(0.95, confidence + 0.04);
  }

  // Volume confirmation + BB Squeeze в пользу направления (+4%)
  const volConfirm = options?.volumeConfirm;
  const bbSq = options?.bbSqueeze;
  if (volConfirm || bbSq) {
    const candlesAlign = (direction === 'LONG' && candlesDir === 'LONG') || (direction === 'SHORT' && candlesDir === 'SHORT');
    if (candlesAlign) confidence = Math.min(0.95, confidence + (volConfirm && bbSq ? 0.06 : 0.04));
  }

  // DOM score сильный (> 0.2 или < -0.2) и совпадает с направлением (+3%)
  const domScore = options?.obDomScore ?? (orderBook as OrderBookResult).domScore ?? 0;
  if (Math.abs(domScore) > 0.2) {
    const domAlign = (direction === 'SHORT' && domScore < -0.2) || (direction === 'LONG' && domScore > 0.2);
    if (domAlign) confidence = Math.min(0.95, confidence + 0.03);
  }

  if (riskReward < 1.5 && riskReward > 0) {
    confidence *= Math.max(0.65, riskReward / 1.5);
  }

  // Штраф при повышенном спреде (0.05–0.1%)
  if (spreadPct > SPREAD_GOOD_PCT && spreadPct <= SPREAD_CAUTION_PCT) {
    confidence = Math.max(0.55, confidence - 0.03);
  }

  // Panic Noise (Antonopoulos): высокая волатильность — осторожность при входе
  if (options?.highVolatility) {
    confidence = Math.max(0.52, confidence - 0.05);
  }

  // Nison (Japanese Candles): 24/7 крипто — пробой без объёма = возможный ложный пробой
  if (options?.falseBreakoutHint) {
    confidence = Math.max(0.52, confidence - 0.06);
  }

  if (confidence < 0.6) {
    return { direction: null, confidence, confluence: false, reason: `confidence ${(confidence * 100).toFixed(0)}% < 60%` };
  }

  return { direction, confidence, confluence: true };
}

/** Сборка breakdown для UI и прогноза */
export function buildAnalysisBreakdown(
  obResult: OrderBookResult,
  tapeResult: TapeResult,
  candlesResult: CandlesResult,
  signalResult: { direction: 'LONG' | 'SHORT' | null; confidence: number; reason?: string }
): AnalysisBreakdown {
  const dirs = [obResult.direction, tapeResult.direction, candlesResult.direction];
  const longCount = dirs.filter((d) => d === 'LONG').length;
  const shortCount = dirs.filter((d) => d === 'SHORT').length;
  const agreeDir = longCount >= 2 ? 'LONG' : shortCount >= 2 ? 'SHORT' : null;
  const agreeCount = Math.max(longCount, shortCount);

  return {
    orderBook: {
      direction: obResult.direction,
      score: obResult.score,
      domScore: obResult.domScore,
      imbalance: obResult.imbalance,
      spreadPct: obResult.spreadPct,
      wallsBid: obResult.bidWalls,
      wallsAsk: obResult.askWalls
    },
    tape: {
      direction: tapeResult.direction,
      score: tapeResult.score,
      delta: tapeResult.delta,
      cvdDivergence: tapeResult.cvdDivergence
    },
    candles: {
      direction: candlesResult.direction,
      score: candlesResult.score,
      patterns: candlesResult.patterns,
      rsi: candlesResult.rsi,
      emaTrend: candlesResult.emaTrend
    },
    confluence: {
      count: agreeCount,
      direction: agreeDir,
      confidence: signalResult.confidence
    },
    forecast: {
      direction: signalResult.direction,
      confidence: signalResult.confidence,
      reason: signalResult.reason ?? (signalResult.direction ? `Прогноз: ${signalResult.direction}, уверенность ${(signalResult.confidence * 100).toFixed(0)}%` : 'Нет сигнала')
    },
  };
}
