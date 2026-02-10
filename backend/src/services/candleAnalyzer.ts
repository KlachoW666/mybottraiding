import { OHLCVCandle, CandlePattern } from '../types/candle';
import { RSI, MACD, BollingerBands, SMA, EMA, ATR, ADX } from 'technicalindicators';

/**
 * Candle Analyzer - анализ свечных паттернов и индикаторов (раздел 5 ТЗ)
 */
export class CandleAnalyzer {
  /**
   * Определение паттерна поглощения
   */
  detectEngulfing(candles: OHLCVCandle[]): CandlePattern {
    if (candles.length < 2) return 'none';
    const [prev, curr] = candles.slice(-2);
    const prevBody = Math.abs(prev.close - prev.open);
    const currBody = Math.abs(curr.close - curr.open);
    const prevIsRed = prev.close < prev.open;
    const currIsGreen = curr.close > curr.open;

    // Бычье поглощение
    if (prevIsRed && currIsGreen && curr.open <= prev.close && curr.close >= prev.open && currBody > prevBody) {
      return 'bullish_engulfing';
    }
    // Медвежье поглощение
    const currIsRed = curr.close < curr.open;
    const prevIsGreen = prev.close > prev.open;
    if (prevIsGreen && currIsRed && curr.open >= prev.close && curr.close <= prev.open && currBody > prevBody) {
      return 'bearish_engulfing';
    }
    return 'none';
  }

  /**
   * Пин-бар (Hammer) — бычий разворот после падения
   */
  detectHammer(candle: OHLCVCandle): boolean {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    return range > 0 && lowerShadow > body * 2 && upperShadow < range * 0.1;
  }

  /**
   * Inverted Hammer — бычий разворот, длинная верхняя тень
   */
  detectInvertedHammer(candle: OHLCVCandle): boolean {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    return range > 0 && upperShadow > body * 2 && lowerShadow < range * 0.1;
  }

  /**
   * Shooting Star — медвежий разворот после роста
   */
  detectShootingStar(candle: OHLCVCandle): boolean {
    return this.detectInvertedHammer(candle);
  }

  /**
   * Hanging Man — медвежий разворот (как Hammer, но после роста)
   */
  detectHangingMan(candle: OHLCVCandle): boolean {
    return this.detectHammer(candle);
  }

  /**
   * Доджи
   */
  detectDoji(candle: OHLCVCandle): boolean {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    return range > 0 && body / range < 0.05;
  }

  /**
   * Dragonfly Doji — длинная нижняя тень, бычий
   */
  detectDragonflyDoji(candle: OHLCVCandle): boolean {
    if (!this.detectDoji(candle)) return false;
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    return lowerShadow > upperShadow * 2;
  }

  /**
   * Gravestone Doji — длинная верхняя тень, медвежий
   */
  detectGravestoneDoji(candle: OHLCVCandle): boolean {
    if (!this.detectDoji(candle)) return false;
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    return upperShadow > lowerShadow * 2;
  }

  /**
   * Spinning Top — нерешительность
   */
  detectSpinningTop(candle: OHLCVCandle): boolean {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    return range > 0 && body / range < 0.3 && lowerShadow > body && upperShadow > body;
  }

  /**
   * Tweezer Tops — два свечи с одинаковыми максимумами, медвежий
   */
  detectTweezerTops(candles: OHLCVCandle[]): boolean {
    if (candles.length < 2) return false;
    const [a, b] = candles.slice(-2);
    const tolerance = (a.high - a.low + b.high - b.low) * 0.02;
    return Math.abs(a.high - b.high) <= tolerance && a.high > a.open && b.close < b.open;
  }

  /**
   * Tweezer Bottoms — два свечи с одинаковыми минимумами, бычий
   */
  detectTweezerBottoms(candles: OHLCVCandle[]): boolean {
    if (candles.length < 2) return false;
    const [a, b] = candles.slice(-2);
    const tolerance = (a.high - a.low + b.high - b.low) * 0.02;
    return Math.abs(a.low - b.low) <= tolerance && a.close < a.open && b.close > b.open;
  }

  /**
   * Piercing Line — бычий разворот [Bar Confirm]
   * Длинная красная, затем зелёная: открытие ниже минимума первой, закрытие выше середины тела первой
   */
  detectPiercingLine(candles: OHLCVCandle[]): boolean {
    if (candles.length < 2) return false;
    const [prev, curr] = candles.slice(-2);
    const prevIsRed = prev.close < prev.open;
    const currIsGreen = curr.close > curr.open;
    if (!prevIsRed || !currIsGreen) return false;
    const prevMid = (prev.open + prev.close) / 2;
    return curr.open < prev.low && curr.close > prevMid && curr.close < prev.open;
  }

  /**
   * Dark Cloud Cover — медвежий разворот [Bar Confirm]
   * Длинная зелёная, затем красная: открытие выше максимума первой, закрытие ниже середины тела первой
   */
  detectDarkCloudCover(candles: OHLCVCandle[]): boolean {
    if (candles.length < 2) return false;
    const [prev, curr] = candles.slice(-2);
    const prevIsGreen = prev.close > prev.open;
    const currIsRed = curr.close < curr.open;
    if (!prevIsGreen || !currIsRed) return false;
    const prevMid = (prev.open + prev.close) / 2;
    return curr.open > prev.high && curr.close < prevMid && curr.close > prev.open;
  }

  /**
   * Morning Star — бычий разворот: красная, маленькая (звезда), зелёная
   */
  detectMorningStar(candles: OHLCVCandle[]): boolean {
    if (candles.length < 3) return false;
    const [a, b, c] = candles.slice(-3);
    const aRed = a.close < a.open;
    const cGreen = c.close > c.open;
    const bSmall = Math.abs(b.close - b.open) / (b.high - b.low || 0.001) < 0.3;
    const cClosesIntoA = c.close > (a.open + a.close) / 2;
    return aRed && bSmall && cGreen && cClosesIntoA;
  }

  /**
   * Evening Star — медвежий разворот: зелёная, маленькая (звезда), красная
   */
  detectEveningStar(candles: OHLCVCandle[]): boolean {
    if (candles.length < 3) return false;
    const [a, b, c] = candles.slice(-3);
    const aGreen = a.close > a.open;
    const cRed = c.close < c.open;
    const bSmall = Math.abs(b.close - b.open) / (b.high - b.low || 0.001) < 0.3;
    const cClosesIntoA = c.close < (a.open + a.close) / 2;
    return aGreen && bSmall && cRed && cClosesIntoA;
  }

  /**
   * Harami — маленькая свеча внутри предыдущей
   */
  detectHarami(candles: OHLCVCandle[]): CandlePattern {
    if (candles.length < 2) return 'none';
    const [prev, curr] = candles.slice(-2);
    const prevBody = Math.abs(prev.close - prev.open);
    const currBody = Math.abs(curr.close - curr.open);
    const currHigh = Math.max(curr.open, curr.close);
    const currLow = Math.min(curr.open, curr.close);
    const prevHigh = Math.max(prev.open, prev.close);
    const prevLow = Math.min(prev.open, prev.close);
    if (currBody >= prevBody * 0.9) return 'none';
    if (currHigh < prevHigh && currLow > prevLow) {
      return curr.close > curr.open ? 'bullish_harami' : 'bearish_harami';
    }
    return 'none';
  }

  /**
   * Bull Marubozu — PDF: сильный бычий импульс, тело без теней
   */
  detectBullMarubozu(candle: OHLCVCandle): boolean {
    const body = candle.close - candle.open;
    if (body <= 0) return false;
    const range = candle.high - candle.low;
    if (range <= 0) return false;
    const lowerShadow = candle.open - candle.low;
    const upperShadow = candle.high - candle.close;
    return body / range > 0.9 && lowerShadow < range * 0.05 && upperShadow < range * 0.05;
  }

  /**
   * Bear Marubozu — PDF: сильный медвежий импульс
   */
  detectBearMarubozu(candle: OHLCVCandle): boolean {
    const body = candle.open - candle.close;
    if (body <= 0) return false;
    const range = candle.high - candle.low;
    if (range <= 0) return false;
    const lowerShadow = candle.close - candle.low;
    const upperShadow = candle.high - candle.open;
    return body / range > 0.9 && lowerShadow < range * 0.05 && upperShadow < range * 0.05;
  }

  /**
   * Three Black Crows — три медвежьих свечи подряд
   */
  detectThreeBlackCrows(candles: { open: number; high: number; low: number; close: number }[]): boolean {
    if (candles.length < 3) return false;
    const [a, b, c] = candles.slice(-3);
    return a.close < a.open && b.close < b.open && c.close < c.open &&
      b.low < a.low && c.low < b.low && a.open > b.open && b.open > c.open;
  }

  /**
   * RSI
   */
  getRSI(closes: number[], period = 14): number | null {
    if (closes.length < period + 1) return null;
    const values = RSI.calculate({ values: closes, period });
    return values[values.length - 1];
  }

  /**
   * MACD
   */
  getMACD(closes: number[]) {
    if (closes.length < 34) return null;
    const result = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    return result[result.length - 1];
  }

  /**
   * Bollinger Bands
   */
  getBollingerBands(closes: number[], period = 20, stdDev = 2) {
    if (closes.length < period) return null;
    const bb = BollingerBands.calculate({ values: closes, period, stdDev });
    return bb[bb.length - 1];
  }

  /** BB Width и средняя ширина — для детекции squeeze (сужение = подготовка к пробою) */
  getBollingerBandsWidth(closes: number[], period = 20, stdDev = 2): { width: number; avgWidth: number } | null {
    if (closes.length < period + 20) return null;
    const bb = BollingerBands.calculate({ values: closes, period, stdDev });
    const last = bb[bb.length - 1] as { upper?: number; lower?: number; middle?: number };
    const upper = last?.upper ?? 0;
    const lower = last?.lower ?? 0;
    const middle = last?.middle ?? (upper + lower) / 2;
    if (middle <= 0) return null;
    const width = (upper - lower) / middle;
    const slice = bb.slice(-20);
    const widths = slice.map((b: { upper?: number; lower?: number; middle?: number }) => {
      const u = b.upper ?? 0;
      const l = b.lower ?? 0;
      const m = b.middle ?? (u + l) / 2;
      return m > 0 ? (u - l) / m : 0;
    });
    const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length;
    return { width, avgWidth };
  }

  /** PDF: EMA(9) > EMA(21) > EMA(50) = сильный восходящий тренд */
  getEMA(closes: number[]): { ema9: number; ema21: number; ema50: number } | null {
    if (closes.length < 50) return null;
    const ema9 = EMA.calculate({ values: closes, period: 9 });
    const ema21 = EMA.calculate({ values: closes, period: 21 });
    const ema50 = EMA.calculate({ values: closes, period: 50 });
    return {
      ema9: ema9[ema9.length - 1],
      ema21: ema21[ema21.length - 1],
      ema50: ema50[ema50.length - 1]
    };
  }

  /** PDF: ATR для SL/TP — TR = max(High-Low, |High-Close_prev|, |Low-Close_prev|), period 14 */
  getATR(candles: { high: number; low: number; close: number }[], period = 14): number | null {
    if (candles.length < period + 1) return null;
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period });
    return atr[atr.length - 1];
  }

  /** Sinclair (Volatility Trading): средний ATR для оценки режима волатильности */
  getATRAvg(candles: { high: number; low: number; close: number }[], period = 14, lookback = 5): number | null {
    if (candles.length < period + lookback) return null;
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);
    const atrArr = ATR.calculate({ high: highs, low: lows, close: closes, period });
    const slice = atrArr.slice(-lookback);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  /** ADX — сила тренда (BinHV27, HLHB). > 25 — тренд, > 30 — сильный */
  getADX(candles: { high: number; low: number; close: number }[], period = 14): number | null {
    if (candles.length < period + 15) return null;
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);
    const adxArr = ADX.calculate({ high: highs, low: lows, close: closes, period }) as { adx: number }[];
    const last = adxArr[adxArr.length - 1];
    return last?.adx ?? null;
  }

  /** EMA(RSI) — BinHV27: emarsi ≤ 20 = глубоко перепродан */
  getEMARSI(closes: number[], rsiPeriod = 5, emaPeriod = 5): number | null {
    if (closes.length < rsiPeriod + emaPeriod + 5) return null;
    const rsiArr = RSI.calculate({ values: closes, period: rsiPeriod });
    const emaRsi = EMA.calculate({ values: rsiArr, period: emaPeriod });
    return emaRsi[emaRsi.length - 1];
  }

  /** Supertrend — ATR-based trend (Supertrend strategy). Returns 'up' | 'down' */
  getSupertrend(candles: { high: number; low: number; close: number }[], multiplier = 3, period = 10): 'up' | 'down' | null {
    if (candles.length < period + 5) return null;
    const atr = this.getATR(candles, period);
    if (!atr || atr <= 0) return null;
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const hl2 = (last.high + last.low) / 2;
    const basicUB = hl2 + multiplier * atr;
    const basicLB = hl2 - multiplier * atr;
    const close = last.close;
    if (close > basicUB) return 'up';
    if (close < basicLB) return 'down';
    return prev.close > prev.high - atr ? 'up' : 'down';
  }

  /** BinHV45/CombinedBinH: close below lower BB, tail < bbdelta*0.25 — бычий отскок */
  detectBinHV45LowerBB(candles: OHLCVCandle[], bbPeriod = 40, bbStd = 2): boolean {
    if (candles.length < bbPeriod + 2) return false;
    const closes = candles.map((c) => c.close);
    const bbArr = BollingerBands.calculate({ values: closes, period: bbPeriod, stdDev: bbStd }) as { upper: number; lower: number; middle: number }[];
    const curr = bbArr[bbArr.length - 1];
    const prevBb = bbArr[bbArr.length - 2];
    if (!curr?.lower || !prevBb?.lower) return false;
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const mid = curr.middle ?? (curr.upper + curr.lower) / 2;
    const bbDelta = Math.abs(mid - curr.lower);
    const tail = Math.abs(last.close - last.low);
    const closedelta = Math.abs(last.close - prev.close);
    return last.close < prevBb.lower &&
      last.close <= prev.close &&
      closedelta > last.close * 0.008 &&
      bbDelta > 0 && tail < bbDelta * 0.25;
  }

  /** ClucMay72018: close < EMA50, close < 0.985*bb_lower, volume < mean*20 — дип на низком объёме */
  detectClucLowVolumeDip(candles: OHLCVCandle[]): boolean {
    if (candles.length < 50) return false;
    const typicalPrices = candles.map((c) => (c.high + c.low + c.close) / 3);
    const closes = candles.map((c) => c.close);
    const ema50 = EMA.calculate({ values: closes, period: 50 });
    const emaVal = ema50[ema50.length - 1];
    const bb = this.getBollingerBands(typicalPrices, 20, 2);
    if (!bb || !bb.lower) return false;
    const lastClose = candles[candles.length - 1].close;
    const lastVol = candles[candles.length - 1].volume ?? 0;
    const prevVolMean = candles.length >= 31
      ? candles.slice(-31, -1).reduce((s, c) => s + (c.volume ?? 0), 0) / 30
      : candles.slice(-30).reduce((s, c) => s + (c.volume ?? 0), 0) / 30;
    return lastClose < emaVal &&
      lastClose < 0.985 * bb.lower &&
      prevVolMean > 0 && lastVol < prevVolMean * 20;
  }

  /** HLHB: RSI cross above 50 + EMA5 cross above EMA10 + ADX > 25 */
  detectHLHBCross(candles: OHLCVCandle[], rsiPeriod = 10): 'LONG' | 'SHORT' | null {
    if (candles.length < 50) return null;
    const closes = candles.map((c) => c.close);
    const hl2 = closes.map((_, i) => (candles[i].high + candles[i].low) / 2);
    const rsiArr = RSI.calculate({ values: hl2, period: rsiPeriod });
    const ema5 = EMA.calculate({ values: closes, period: 5 });
    const ema10 = EMA.calculate({ values: closes, period: 10 });
    const adx = this.getADX(candles, 14);
    if (!adx || adx < 25) return null;
    const r = rsiArr[rsiArr.length - 1];
    const rPrev = rsiArr[rsiArr.length - 2];
    const e5 = ema5[ema5.length - 1];
    const e5Prev = ema5[ema5.length - 2];
    const e10 = ema10[ema10.length - 1];
    const e10Prev = ema10[ema10.length - 2];
    const rsiCrossUp = rPrev < 50 && r >= 50;
    const rsiCrossDown = rPrev > 50 && r <= 50;
    const emaCrossUp = e5Prev <= e10Prev && e5 > e10;
    const emaCrossDown = e5Prev >= e10Prev && e5 < e10;
    if (rsiCrossUp && emaCrossUp) return 'LONG';
    if (rsiCrossDown && emaCrossDown) return 'SHORT';
    return null;
  }

  /** VolatilitySystem: abs(close_change) > ATR*2 — волатильностный пробой */
  detectVolatilityBreakout(candles: { high: number; low: number; close: number }[]): 'LONG' | 'SHORT' | null {
    if (candles.length < 20) return null;
    const atr = this.getATR(candles, 14);
    if (!atr || atr <= 0) return null;
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const closeChange = last.close - prev.close;
    const threshold = atr * 2;
    if (closeChange > threshold) return 'LONG';
    if (closeChange < -threshold) return 'SHORT';
    return null;
  }

  /** MACD crossover: bullish = histogram cross up, bearish = cross down */
  getMACDCrossover(closes: number[]): 'bullish' | 'bearish' | null {
    if (closes.length < 35) return null;
    const result = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    if (result.length < 2) return null;
    const prev = result[result.length - 2];
    const curr = result[result.length - 1];
    const prevH = (prev as { MACD?: number; signal?: number; histogram?: number }).histogram ?? (prev as number);
    const currH = (curr as { MACD?: number; signal?: number; histogram?: number }).histogram ?? (curr as number);
    if (typeof prevH !== 'number' || typeof currH !== 'number') return null;
    if (prevH < 0 && currH > 0) return 'bullish';
    if (prevH > 0 && currH < 0) return 'bearish';
    return null;
  }
}
