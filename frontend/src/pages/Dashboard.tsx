import { useState, useEffect } from 'react';
import { TradingSignal } from '../types/signal';
import { api } from '../utils/api';
import AnalysisBreakdown, { AnalysisBreakdown as BreakdownType } from '../components/AnalysisBreakdown';

const QUICK_SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT'];

export interface AppStats {
  orders: {
    total: number;
    wins: number;
    losses: number;
    totalPnl: number;
    totalPnlPercent: number;
    winRate: number;
    openCount: number;
  };
  usersCount: number;
  volumeEarned: number;
  status: 'ok' | 'degraded';
  databaseMode: 'sqlite' | 'memory';
  okxConnected: boolean;
}

export default function Dashboard() {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [stats, setStats] = useState<AppStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [symbol, setSymbol] = useState('BTC-USDT');
  const [tab, setTab] = useState<'overview' | 'signals' | 'stats'>('overview');
  const [lastBreakdown, setLastBreakdown] = useState<BreakdownType | null>(null);

  useEffect(() => {
    const fetchStats = () => {
      api.get<AppStats>('/stats')
        .then(setStats)
        .catch(() => setStats(null));
    };
    fetchStats();
    const id = setInterval(fetchStats, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api.get<TradingSignal[]>('/signals?limit=10')
      .then(setSignals)
      .catch(() => {})
      .finally(() => setLoading(false));

    const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'signal' && msg.data) {
          const payload = msg.data as { signal?: TradingSignal } & TradingSignal;
          const sig = payload.signal ?? payload;
          if (sig?.symbol != null) setSignals((prev) => [sig as TradingSignal, ...prev.slice(0, 9)]);
        }
      } catch {}
    };
    return () => ws.close();
  }, []);

  const runAnalysis = () => {
    setAnalyzing(true);
    setLastBreakdown(null);
    api.post<{ signal?: TradingSignal; breakdown?: BreakdownType }>(`/market/analyze/${encodeURIComponent(symbol)}`, { timeframe: '5m' })
      .then((data) => {
        if (data.signal) setSignals((prev) => [data.signal!, ...prev.slice(0, 9)]);
        if (data.breakdown) setLastBreakdown(data.breakdown);
      })
      .catch(() => {})
      .finally(() => setAnalyzing(false));
  };

  const longCount = signals.filter((s) => s.direction === 'LONG').length;
  const shortCount = signals.filter((s) => s.direction === 'SHORT').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Статистика приложения — ордера, пользователи, объём, статус */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5 md:p-6">
          <p className="text-sm mb-1 tracking-wide" style={{ color: 'var(--text-muted)' }}>Ордера (всего)</p>
          <p className="text-2xl md:text-3xl font-bold tracking-tight">
            {stats?.orders.total ?? '—'}
          </p>
          {stats && stats.orders.total > 0 && (
            <p className="text-sm mt-2 flex items-center gap-2">
              <span style={{ color: 'var(--success)' }}>+{stats.orders.wins}</span>
              <span style={{ color: 'var(--text-muted)' }}>/</span>
              <span style={{ color: 'var(--danger)' }}>-{stats.orders.losses}</span>
              <span style={{ color: 'var(--text-muted)' }}>• Win rate {stats.orders.winRate}%</span>
            </p>
          )}
        </div>
        <div className="card p-5 md:p-6">
          <p className="text-sm mb-1 tracking-wide" style={{ color: 'var(--text-muted)' }}>Пользователей</p>
          <p className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: 'var(--accent)' }}>
            {stats?.usersCount ?? '—'}
          </p>
        </div>
        <div className="card p-5 md:p-6">
          <p className="text-sm mb-1 tracking-wide" style={{ color: 'var(--text-muted)' }}>Объём заработанных</p>
          <p className={`text-2xl md:text-3xl font-bold tracking-tight ${(stats?.volumeEarned ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {(stats?.volumeEarned ?? 0) >= 0 ? '+' : ''}{(stats?.volumeEarned ?? 0).toFixed(2)} $
          </p>
        </div>
        <div className="card p-5 md:p-6">
          <p className="text-sm mb-1 tracking-wide" style={{ color: 'var(--text-muted)' }}>Статус приложения</p>
          <p className="font-medium flex items-center gap-2" style={{ color: stats?.status === 'ok' ? 'var(--success)' : 'var(--warning)' }}>
            <span className={`w-2 h-2 rounded-full ${stats?.status === 'ok' ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--warning)]'}`} />
            {stats?.status === 'ok' ? 'Online' : 'Degraded'}
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            OKX: {stats?.okxConnected ? 'подключён' : 'нет'} • БД: {stats?.databaseMode === 'sqlite' ? 'SQLite' : 'in-memory'}
          </p>
        </div>
      </section>

      {/* Current Balance block — Cryptory style */}
      <div className="card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-sm mb-2 tracking-wide" style={{ color: 'var(--text-muted)' }}>Сигналов за сессию</p>
            <div className="flex items-baseline gap-4">
              <span className="text-4xl md:text-5xl font-bold tracking-tight">{signals.length}</span>
              {signals.length > 0 && (
                <span className="flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--accent)' }}>
                  <span>↑</span>
                  <span>LONG {longCount} / SHORT {shortCount}</span>
                </span>
              )}
            </div>
            <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              OKX • TradingView • Scalpboard
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-sm">Ещё</button>
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="btn-primary disabled:opacity-50 flex items-center gap-2"
            >
              <span>+</span>
              Анализировать
            </button>
          </div>
        </div>
      </div>

      {/* Tabs — Cryptory Chart/Allocation/Statistics */}
      <div className="flex gap-1 p-1.5 rounded-lg" style={{ background: 'var(--bg-card-solid)' }}>
        {(['overview', 'signals', 'stats'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`tab-btn flex-1 ${tab === t ? 'active' : ''}`}
          >
            {t === 'overview' ? 'Обзор' : t === 'signals' ? 'Сигналы' : 'Статистика'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="card p-6 md:p-8">
          <h2 className="section-title mb-5">Обзор рынка</h2>
          <div className="flex flex-wrap gap-3 items-center mb-6">
            <div className="flex gap-2">
              {QUICK_SYMBOLS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSymbol(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    symbol === s ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {s.split('-')[0]}
                </button>
              ))}
            </div>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/\s/g, ''))}
              placeholder="Символ (BTC-USDT)"
              className="input-field w-40"
            />
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="btn-primary disabled:opacity-50 flex items-center gap-2"
            >
              {analyzing ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Анализ...
                </>
              ) : (
                <>
                  <span>▸</span> Анализировать
                </>
              )}
            </button>
          </div>
          {lastBreakdown && (
            <div className="mt-6">
              <AnalysisBreakdown data={lastBreakdown} />
            </div>
          )}
        </div>
      )}

      {tab === 'signals' && (
        <section className="card p-6 md:p-8">
          <h2 className="section-title mb-5">Активные сигналы</h2>
          {loading ? (
            <p className="leading-relaxed" style={{ color: 'var(--text-muted)' }}>Загрузка...</p>
          ) : signals.length === 0 ? (
            <p className="leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Нет сигналов. Нажмите «Анализировать» для получения сигнала.
            </p>
          ) : (
            <div className="space-y-4">
              {signals.slice(0, 5).map((s) => (
                <div
                  key={s.id}
                  className={`flex flex-wrap items-center gap-4 p-5 rounded-lg border transition-all ${
                    s.direction === 'LONG' ? 'bg-[var(--success-bg)] border-[var(--success)]/30' : 'bg-[var(--danger-bg)] border-[var(--danger)]/30'
                  }`}
                >
                  <span className="font-bold">{s.symbol}</span>
                  <span className={s.direction === 'LONG' ? 'badge-long' : 'badge-short'}>
                    {s.direction === 'LONG' ? 'ПОКУПАТЬ ↑' : 'ПРОДАВАТЬ ↓'}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>Вход: {s.entry_price.toLocaleString('ru-RU')}</span>
                  <span className="text-sm" style={{ color: 'var(--danger)' }}>SL: {s.stop_loss.toLocaleString('ru-RU')}</span>
                  <span className="text-sm" style={{ color: 'var(--success)' }}>TP: {s.take_profit.map(t => t.toLocaleString('ru-RU')).join(' / ')}</span>
                  <span className="text-sm font-mono" style={{ color: 'var(--accent)' }}>{(s.confidence * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'stats' && (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-5 md:p-6">
            <p className="section-title mb-2">Сигналов за сессию</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{signals.length}</p>
          </div>
          <div className="card p-5 md:p-6">
            <p className="section-title mb-2">Ордера (прибыль / убыток)</p>
            <p className="text-sm font-medium">
              {stats ? (
                <>
                  <span style={{ color: 'var(--success)' }}>+{stats.orders.wins}</span>
                  <span style={{ color: 'var(--text-muted)' }}> / </span>
                  <span style={{ color: 'var(--danger)' }}>-{stats.orders.losses}</span>
                  <span className="block mt-1" style={{ color: 'var(--text-muted)' }}>Всего: {stats.orders.total}</span>
                </>
              ) : (
                '—'
              )}
            </p>
          </div>
          <div className="card p-5 md:p-6">
            <p className="section-title mb-2">Интеграции</p>
            <p className="text-sm font-medium flex items-center gap-2 flex-wrap" style={{ color: 'var(--accent)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> OKX
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> TradingView
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> Scalpboard
            </p>
          </div>
          <div className="card p-5 md:p-6">
            <p className="section-title mb-2">Статус</p>
            <p className="font-medium flex items-center gap-2" style={{ color: stats?.status === 'ok' ? 'var(--success)' : 'var(--warning)' }}>
              <span className={`w-2 h-2 rounded-full ${stats?.status === 'ok' ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--warning)]'}`} />
              {stats?.status === 'ok' ? 'Online' : 'Degraded'}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
