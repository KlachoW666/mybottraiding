/**
 * OKX symbol normalization — single source of truth.
 * OKX futures: BTC-USDT-SWAP, instId: BTC-USDT-SWAP
 */

/** Маппинг символов для OKX (переименования/отсутствующие пары) */
const OKX_SYMBOL_MAP: Record<string, string> = {
  MATIC: 'POL' // Polygon rebrand на OKX
};

/**
 * Normalize to internal format: BTC-USDT (always with hyphen)
 */
export function normalizeSymbol(symbol: string): string {
  if (!symbol || typeof symbol !== 'string') return '';
  let s = symbol.replace(/\s/g, '').replace(/_/g, '-').replace(/-SWAP$/i, '').replace(/:USDT$/i, '').toUpperCase();
  if (s.includes('/')) s = s.replace('/', '-');
  if (s.endsWith('USDT') && !s.includes('-')) s = s.slice(0, -4) + '-USDT';
  return s;
}

/**
 * Convert to OKX ccxt format: BTC/USDT:USDT (с учётом маппинга для OKX)
 */
export function toOkxCcxtSymbol(symbol: string): string {
  const s = normalizeSymbol(symbol);
  if (!s || !s.includes('-')) return '';
  let [base, quote] = s.split('-');
  base = OKX_SYMBOL_MAP[base] ?? base;
  return `${base}/${quote}:USDT`;
}

/**
 * Convert to OKX WebSocket instId: BTC-USDT-SWAP
 */
export function toOkxInstId(symbol: string): string {
  const s = normalizeSymbol(symbol);
  if (!s) return '';
  return s.includes('-') ? `${s}-SWAP` : `${s}-USDT-SWAP`;
}

/**
 * Validate symbol format (basic check)
 */
export function isValidSymbol(symbol: string): boolean {
  const s = normalizeSymbol(symbol);
  return s.length >= 4 && s.includes('-') && /^[A-Z0-9]+-[A-Z0-9]+$/.test(s);
}
