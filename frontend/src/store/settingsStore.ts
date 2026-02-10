const STORAGE_KEY = 'cryptosignal-settings';

export interface Settings {
  connections: {
    okx: { enabled: boolean; apiKey: string; apiSecret: string; passphrase: string };
    /** Прокси для OKX: http://user:pass@ip:port */
    proxy?: string;
    tradingview: { enabled: boolean };
    scalpboard: { enabled: boolean; apiKey: string };
  };
  analysis: {
    timeframe: string;
    candlePatterns: boolean;
    orderbookAnalysis: boolean;
    volumeAnalysis: boolean;
    minConfidence: number;
    minRR: number;
  };
  notifications: {
    desktop: boolean;
    sound: boolean;
    long: boolean;
    short: boolean;
    minConfidence: number;
    telegram: { enabled: boolean; botToken: string; chatId: string };
  };
  display: {
    theme: 'dark' | 'light';
    language: 'ru' | 'en';
    chartStyle: 'candles' | 'heikin-ashi' | 'line';
    orderbookStyle: 'default' | 'grouped' | 'heatmap';
  };
  risk: {
    maxPositionPercent: number;
    defaultStopLoss: number;
    takeProfitLevels: string;
    trailingStop: boolean;
    trailingStopPercent: number;
  };
}

const defaults: Settings = {
  connections: {
    okx: { enabled: true, apiKey: '', apiSecret: '', passphrase: '' },
    proxy: '',
    tradingview: { enabled: true },
    scalpboard: { enabled: false, apiKey: '' }
  },
  analysis: {
    timeframe: '5m',
    candlePatterns: true,
    orderbookAnalysis: true,
    volumeAnalysis: true,
    minConfidence: 70,
    minRR: 2
  },
  notifications: {
    desktop: true,
    sound: true,
    long: true,
    short: true,
    minConfidence: 75,
    telegram: { enabled: false, botToken: '', chatId: '' }
  },
  display: {
    theme: 'dark',
    language: 'ru',
    chartStyle: 'candles',
    orderbookStyle: 'default'
  },
  risk: {
    maxPositionPercent: 10,
    defaultStopLoss: 1.5,
    takeProfitLevels: '1, 2, 3',
    trailingStop: false,
    trailingStopPercent: 1
  }
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = { ...defaults, ...parsed };
      if (parsed?.notifications) {
        merged.notifications = { ...defaults.notifications, ...parsed.notifications, telegram: { ...defaults.notifications.telegram, ...(parsed.notifications.telegram || {}) } };
      }
      if (parsed?.connections) {
        merged.connections = {
          ...defaults.connections,
          ...parsed.connections,
          okx: { ...defaults.connections.okx, ...parsed.connections.okx },
          proxy: parsed.connections?.proxy ?? defaults.connections.proxy ?? '',
          tradingview: { ...defaults.connections.tradingview, ...parsed.connections.tradingview },
          scalpboard: { ...defaults.connections.scalpboard, ...parsed.connections.scalpboard }
        };
      }
      return merged;
    }
  } catch {}
  return { ...defaults };
}

function save(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

let settings = load();

export function getSettings(): Settings {
  return settings;
}

export function updateSettings(partial: Partial<Settings>) {
  settings = { ...settings, ...partial };
  save(settings);
  return settings;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings = { ...settings, [key]: value };
  save(settings);
  return settings;
}
