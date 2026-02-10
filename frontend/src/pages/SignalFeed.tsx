import { useState, useEffect } from 'react';
import { TradingSignal } from '../types/signal';

const API = '/api';

export default function SignalFeed() {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'LONG' | 'SHORT'>('all');

  useEffect(() => {
    fetch(`${API}/signals?limit=50`)
      .then((r) => r.json())
      .then(setSignals)
      .finally(() => setLoading(false));

    const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'signal' && msg.data) {
          const payload = msg.data as { signal?: TradingSignal } & TradingSignal;
          const sig = payload.signal ?? payload;
          if (sig?.symbol != null) setSignals((prev) => [sig as TradingSignal, ...prev]);
        }
      } catch {}
    };
    return () => ws.close();
  }, []);

  const filtered =
    filter === 'all' ? signals : signals.filter((s) => s.direction === filter);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex gap-2 flex-wrap">
        {(['all', 'LONG', 'SHORT'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl font-medium transition-all ${
              filter === f
                ? 'btn-primary text-white'
                : 'rounded-[10px] px-4 py-2 text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'
            }`}
          >
            {f === 'all' ? 'Все' : f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>Загрузка сигналов...</p>
      ) : (
        <div className="space-y-5">
          {filtered.map((s, idx) => (
            <div
              key={s.id ?? `sig-${idx}`}
              className={`card overflow-hidden transition-all duration-300 p-5 md:p-6 ${
                s.direction === 'LONG'
                  ? 'border-l-4 border-l-[var(--success)]'
                  : 'border-l-4 border-l-[var(--danger)]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className="font-bold text-lg">{s.symbol}</span>
                    <span className={s.direction === 'LONG' ? 'badge-long' : 'badge-short'}>
                      {s.direction === 'LONG' ? 'ОТКРЫТЬ LONG (ПОКУПКА)' : 'ОТКРЫТЬ SHORT (ПРОДАЖА)'}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {s.exchange} • {s.timeframe}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
                    <div className="rounded-lg px-4 py-3 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                      <p className="section-title text-xs mb-2">Вход (Entry)</p>
                      <p className="font-mono font-bold">{(s.entry_price ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="rounded-lg px-4 py-3 border border-[var(--danger)]/30" style={{ background: 'var(--danger-bg)' }}>
                      <p className="section-title text-xs mb-1" style={{ color: 'var(--danger)' }}>Стоп-лосс (SL)</p>
                      <p className="font-mono font-bold" style={{ color: 'var(--danger)' }}>{(s.stop_loss ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="rounded-lg px-4 py-3 border border-[var(--success)]/30" style={{ background: 'var(--success-bg)' }}>
                      <p className="section-title text-xs mb-2" style={{ color: 'var(--success)' }}>Тейк-профит (TP)</p>
                      <p className="font-mono text-sm" style={{ color: 'var(--success)' }}>
                        {(Array.isArray(s.take_profit) ? s.take_profit : []).map((t) => (t ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 })).join(' / ') || '—'}
                      </p>
                    </div>
                    <div className="rounded-lg px-4 py-3 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                      <p className="section-title text-xs mb-2">R:R / Уверенность</p>
                      <p className="font-mono" style={{ color: 'var(--warning)' }}>{s.risk_reward ?? '—'} / {((s.confidence ?? 0) * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                  <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {s.timestamp ? new Date(s.timestamp).toLocaleString('ru') : '—'}
                    {Array.isArray(s.triggers) && s.triggers.length > 0 && ` • Триггеры: ${s.triggers.join(', ')}`}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
