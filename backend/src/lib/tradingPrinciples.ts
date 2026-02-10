/**
 * Trading Principles — правила из книг:
 * Психология: Douglas (Trading in the Zone, Disciplined Trader), Steenbarger (Psychology of Trading)
 * ТА: Murphy (Technical Analysis), Nison (Japanese Candlestick), Schwager (Market Wizards, TA Course)
 * Волатильность: Sinclair (Volatility Trading)
 * Крипто: Burniske & Tatar (Cryptoassets), Antonopoulos (Internet of Money), Swan (Blockchain Blueprint)
 * Алгоритмы: Chan (Algorithmic Trading)
 */

/** Schwager: риск на сделку 1–2%, макс 3% на любую сделку */
export const RISK_PCT_PER_TRADE = 0.02;   // 2%
export const RISK_MAX_PCT = 0.03;         // 3% — абсолютный максимум

/** Schwager: формула размера позиции
 * Размер позиции = Риск в $ / (Размер стопа в % от цены)
 */
export function calcPositionSizeFromRisk(
  deposit: number,
  entryPrice: number,
  stopPrice: number,
  riskPct: number = RISK_PCT_PER_TRADE,
  maxRiskPct: number = RISK_MAX_PCT
): { sizeUsd: number; riskUsd: number; stopPct: number } {
  const riskUsd = deposit * Math.min(riskPct, maxRiskPct);
  const stopPct = Math.abs(entryPrice - stopPrice) / entryPrice;
  if (stopPct <= 0) return { sizeUsd: 0, riskUsd: 0, stopPct: 0 };
  const sizeUsd = riskUsd / stopPct;
  return { sizeUsd, riskUsd, stopPct };
}

/** Schwager: trailing stop — подвижный стоп вслед за ценой */
export const TRAILING_STOP_DEFAULT_PCT = 0.005;  // 0.5% от цены

/** Burniske: вероятностное мышление — мин. R:R для асимметричных возможностей */
export const ASYMMETRIC_RR_MIN = 2;  // мин. R:R для асимметричной возможности

/** Schwager: распознавание провалившихся сигналов — когда индикатор говорит одно, цена другое */
export interface FailedSignalHint {
  rsiExtreme: boolean;      // RSI < 30 или > 70
  priceAgainstRsi: boolean; // цена идёт против RSI (перекуплен но растёт)
  reduceConfidence: number; // на сколько снизить confidence (0–0.15)
}

/** Schwager: пороги RSI для экстремальных зон */
export const RSI_OVERSOLD = 30;
export const RSI_OVERBOUGHT = 70;

/** Schwager: величина снижения confidence при провалившемся сигнале */
export const FAILED_SIGNAL_CONFIDENCE_REDUCTION = 0.12;

/**
 * Schwager: распознавание провалившихся сигналов.
 * Когда RSI в экстремуме (перекуплен/перепродан), а цена идёт против ожидаемого разворота — сигнал ненадёжен.
 * LONG при RSI oversold + падение цены = «ловля ножа». SHORT при RSI overbought + рост цены = шорт против тренда.
 */
export function detectFailedSignalHint(
  rsi: number | null | undefined,
  priceDirection: 'up' | 'down',  // направление цены (последние свечи)
  signalDirection: 'LONG' | 'SHORT'
): FailedSignalHint | null {
  if (rsi == null) return null;
  const rsiExtreme = rsi <= RSI_OVERSOLD || rsi >= RSI_OVERBOUGHT;
  if (!rsiExtreme) return null;

  // LONG: RSI oversold предполагает отскок, но цена падает — ненадёжно
  // SHORT: RSI overbought предполагает падение, но цена растёт — ненадёжно
  const priceAgainstRsi =
    (rsi <= RSI_OVERSOLD && priceDirection === 'down' && signalDirection === 'LONG') ||
    (rsi >= RSI_OVERBOUGHT && priceDirection === 'up' && signalDirection === 'SHORT');

  if (!priceAgainstRsi) return null;

  return {
    rsiExtreme: true,
    priceAgainstRsi: true,
    reduceConfidence: FAILED_SIGNAL_CONFIDENCE_REDUCTION
  };
}

/** Schwager: поддержка/сопротивление — уровень должен быть пробит с объёмом */
export const VOLUME_BREAKOUT_MULTIPLIER = 1.2;  // объём при пробое > 1.2× среднего

/** Burniske: диверсификация — не более X% в один актив */
export const MAX_SINGLE_ASSET_PCT = 0.25;  // 25% макс на один актив

/** Sinclair (Volatility Trading): при высокой волатильности — уменьшить размер позиции */
export const VOLATILITY_REDUCTION_THRESHOLD = 1.5;  // ATR/avgATR > 1.5 = высокая волатильность
export const VOLATILITY_SIZE_MULTIPLIER = 0.7;     // при высокой волатильности × 0.7

/** Nison (Japanese Candles): на 24/7 крипто больше ложных пробоев — требуется объём */
export const FALSE_BREAKOUT_VOLUME_MIN = 1.3;  // пробой без объёма > 1.3× avg = подозрительно

/**
 * Sinclair (Volatility Trading): множитель размера при высокой волатильности.
 * Крипто: волатильность в 5–10× выше акций — уменьшаем риск при всплеске ATR.
 */
export function volatilitySizeMultiplier(atr: number | null, avgAtr: number | null): number {
  if (!atr || !avgAtr || avgAtr <= 0) return 1;
  if (atr / avgAtr > VOLATILITY_REDUCTION_THRESHOLD) return VOLATILITY_SIZE_MULTIPLIER;
  return 1;
}

/**
 * Nison: признак возможного ложного пробоя — пробой уровня без подтверждения объёмом.
 * На 24/7 крипто: гэпов меньше, ложных пробоев больше.
 */
export function isPotentialFalseBreakout(
  currentVolume: number,
  avgVolume: number,
  isBreakout: boolean
): boolean {
  if (!isBreakout || avgVolume <= 0) return false;
  return currentVolume < avgVolume * FALSE_BREAKOUT_VOLUME_MIN;
}
