/**
 * Trailing Stop — динамическое обновление стоп-лосса (MaksBaks Урок 11.3)
 * Активация после достижения прибыли, шаг трейлинга за ценой.
 */

export interface TrailingStopConfig {
  initialStopPct: number;      // начальный стоп в % от цены (0.005 = 0.5%)
  trailStepPct: number;       // шаг трейлинга (0.003 = 0.3%)
  activationProfitPct: number; // активация после прибыли в % (0.01 = 1%)
}

export const DEFAULT_TRAILING_CONFIG: TrailingStopConfig = {
  initialStopPct: 0.005,
  trailStepPct: 0.003,
  activationProfitPct: 0.01
};

/**
 * Обновить уровень трейлинг-стопа при движении цены в прибыль.
 * LONG: стоп двигается вверх, не опускается.
 * SHORT: стоп двигается вниз, не поднимается.
 */
export function updateTrailingStop(
  entryPrice: number,
  currentPrice: number,
  direction: 'LONG' | 'SHORT',
  currentStop: number,
  config: TrailingStopConfig = DEFAULT_TRAILING_CONFIG
): number {
  const profitPct = direction === 'LONG'
    ? (currentPrice - entryPrice) / entryPrice
    : (entryPrice - currentPrice) / entryPrice;

  if (profitPct < config.activationProfitPct) return currentStop;

  const step = entryPrice * config.trailStepPct;
  if (direction === 'LONG') {
    const newStop = currentPrice - step;
    if (newStop > currentStop && newStop < currentPrice) return newStop;
    return currentStop;
  } else {
    const newStop = currentPrice + step;
    if (newStop < currentStop && newStop > currentPrice) return newStop;
    return currentStop;
  }
}

/**
 * Проверить, достигнут ли трейлинг-стоп (выход из позиции).
 */
export function shouldExitByTrailingStop(
  currentPrice: number,
  trailingStop: number,
  direction: 'LONG' | 'SHORT'
): boolean {
  if (direction === 'LONG') return currentPrice <= trailingStop;
  return currentPrice >= trailingStop;
}
