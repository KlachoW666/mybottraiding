/**
 * Centralized configuration for CryptoSignal Pro backend.
 * All env vars and constants in one place.
 */

function envStr(key: string, fallback = ''): string {
  return (process.env[key] ?? fallback).trim();
}

function envNum(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(key: string, fallback = false): boolean {
  const v = process.env[key]?.toLowerCase();
  if (v === undefined || v === '') return fallback;
  return v === '1' || v === 'true' || v === 'yes';
}

export const config = {
  port: envNum('PORT', 3000),
  nodeEnv: envStr('NODE_ENV', 'development'),
  isProd: process.env.NODE_ENV === 'production',

  okx: {
    apiKey: envStr('OKX_API_KEY'),
    secret: envStr('OKX_SECRET'),
    passphrase: envStr('OKX_PASSPHRASE'),
    get hasCredentials(): boolean {
      return Boolean(this.apiKey && this.secret);
    },
    /** Testnet (демо): OKX_SANDBOX=1 — торговля на тестовом счёте */
    get sandbox(): boolean {
      return envBool('OKX_SANDBOX', false);
    }
  },

  /** Включить исполнение ордеров через OKX при авто-трейдинге. Без флага — только сигналы. */
  get autoTradingExecutionEnabled(): boolean {
    return envBool('AUTO_TRADING_EXECUTION_ENABLED', false);
  },

  /** Прокси для запросов к OKX (обход Cloudflare). PROXY_LIST — список через запятую */
  proxyList: (() => {
    const raw = envStr('PROXY_LIST');
    if (raw) return raw.split(',').map((s) => s.trim()).filter(Boolean);
    return [
      'http://user351292:czwhnm@138.124.21.91:2721',
      'http://user351292:czwhnm@138.124.21.136:2721',
      'http://user351292:czwhnm@138.124.21.153:2721',
      'http://user351292:czwhnm@138.124.21.207:2721',
      'http://user351292:czwhnm@138.124.21.250:2721'
    ];
  })(),
  get proxy(): string {
    const list = this.proxyList;
    return list.length > 0 ? list[Math.floor(Math.random() * list.length)] : '';
  },

  /** OKX REST/WS limits — глубокий анализ */
  limits: {
    orderBook: 400,
    trades: 500,
    candles: 1000,
    candlesMax: 1000
  },

  /** Timeframes and 48h bar counts */
  timeframes: {
    '1m': 2880,
    '5m': 576,
    '15m': 192,
    '1h': 48,
    '4h': 12,
    '1d': 2
  } as Record<string, number>
};

export default config;
