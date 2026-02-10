/**
 * Liquidation price — формула из freqtrade-develop (exchange.py, binance.py)
 * OKX Isolated Futures USDT-M: https://www.okx.com/support/hc/en-us/articles/360053909592
 *
 * value = entry / leverage (margin per unit of base)
 * LONG:  liq = (entry - value) / (1 - mm_ratio - taker_fee)
 * SHORT: liq = (entry + value) / (1 + mm_ratio + taker_fee)
 *
 * + liquidation_buffer (freqtrade) — сдвиг от расчётной ликвидации для безопасности
 */

/** Maintenance Margin Ratio — OKX ~0.4% для большинства тиров */
const MM_RATIO = 0.004;
/** Taker fee — OKX futures ~0.05% */
const TAKER_FEE = 0.0005;
/** Freqtrade: buffer — сдвиг от расчётной ликвидации (5%) для избежания ликвидации */
const LIQUIDATION_BUFFER = 0.05;

/**
 * Расчёт цены ликвидации для Isolated Futures USDT-M (OKX, Binance-style)
 * @param entryPrice — цена входа
 * @param leverage — плечо (1–125)
 * @param direction — LONG | SHORT
 * @param mmRatio — maintenance margin ratio (default OKX ~0.4%)
 * @param takerFee — комиссия тейкера (default 0.05%)
 * @param buffer — буфер безопасности (default 0.05 = 5%)
 */
export function calcLiquidationPrice(
  entryPrice: number,
  leverage: number,
  direction: 'LONG' | 'SHORT',
  options?: { mmRatio?: number; takerFee?: number; buffer?: number }
): number {
  if (entryPrice <= 0 || leverage < 1) return 0;
  const lev = Math.min(125, Math.max(1, leverage));
  const mm = options?.mmRatio ?? MM_RATIO;
  const taker = options?.takerFee ?? TAKER_FEE;
  const buf = options?.buffer ?? LIQUIDATION_BUFFER;

  const value = entryPrice / lev;
  const mmTaker = mm + taker;

  let liq: number;
  if (direction === 'LONG') {
    liq = (entryPrice - value) / (1 - mmTaker);
  } else {
    liq = (entryPrice + value) / (1 + mmTaker);
  }

  if (liq <= 0) return 0;

  const bufferAmount = Math.abs(entryPrice - liq) * buf;
  const liqWithBuffer =
    direction === 'LONG'
      ? liq - bufferAmount
      : liq + bufferAmount;

  return Math.max(0, liqWithBuffer);
}

/**
 * Упрощённая формула (банкротство): entry * (1 ± 1/leverage)
 * Используется как fallback при отсутствии mm_ratio
 */
export function calcLiquidationPriceSimple(
  entryPrice: number,
  leverage: number,
  direction: 'LONG' | 'SHORT'
): number {
  if (entryPrice <= 0 || leverage < 1) return 0;
  const lev = Math.min(125, Math.max(1, leverage));
  if (direction === 'LONG') {
    return entryPrice * (1 - 1 / lev);
  }
  return entryPrice * (1 + 1 / lev);
}
