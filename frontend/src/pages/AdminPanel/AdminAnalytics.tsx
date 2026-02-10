import { useState, useEffect } from 'react';
import { adminApi } from '../../utils/adminApi';

interface AnalyticsData {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
}

interface TradeRow {
  id: string;
  pair: string;
  direction: string;
  openPrice: number;
  closePrice: number | null;
  pnl: number | null;
  openTime: string;
  closeTime: string | null;
}

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [a, t] = await Promise.all([
          adminApi.get<AnalyticsData>('/admin/analytics?limit=500'),
          adminApi.get<TradeRow[]>('/admin/trades/history?limit=100')
        ]);
        setAnalytics(a);
        setTrades(t);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>;
  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;

  const a = analytics!;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-bold tracking-tight">Аналитика и отчёты</h2>

      <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h3 className="text-lg font-semibold mb-4">📊 Сводка по сделкам</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span style={{ color: 'var(--text-muted)' }}>Всего сделок:</span> {a.totalTrades}</div>
          <div><span style={{ color: 'var(--text-muted)' }}>Win Rate:</span> {a.winRate.toFixed(1)}%</div>
          <div><span style={{ color: 'var(--text-muted)' }}>Прибыльных:</span> {a.wins}</div>
          <div><span style={{ color: 'var(--text-muted)' }}>Убыточных:</span> {a.losses}</div>
          <div><span style={{ color: 'var(--text-muted)' }}>Total PnL:</span> <span className={a.totalPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>{a.totalPnl >= 0 ? '+' : ''}{a.totalPnl.toFixed(2)}</span></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Profit Factor:</span> {a.profitFactor.toFixed(2)}</div>
          <div><span style={{ color: 'var(--text-muted)' }}>Лучшая сделка:</span> <span className="text-[var(--success)]">+{a.bestTrade.toFixed(2)}</span></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Худшая сделка:</span> <span className="text-[var(--danger)]">{a.worstTrade.toFixed(2)}</span></div>
        </div>
      </section>

      <section className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h3 className="text-lg font-semibold p-4 border-b" style={{ borderColor: 'var(--border)' }}>📜 История сделок (последние 100)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-hover)' }}>
                <th className="text-left py-3 px-2">Пара</th>
                <th className="text-left py-3 px-2">Направление</th>
                <th className="text-right py-3 px-2">Вход</th>
                <th className="text-right py-3 px-2">Выход</th>
                <th className="text-right py-3 px-2">P&L</th>
                <th className="text-left py-3 px-2">Время закрытия</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center" style={{ color: 'var(--text-muted)' }}>Нет закрытых сделок</td></tr>
              ) : (
                trades.map((row) => (
                  <tr key={row.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2 px-2">{row.pair}</td>
                    <td className="py-2 px-2">{row.direction}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{row.openPrice?.toFixed(4) ?? '—'}</td>
                    <td className="text-right py-2 px-2 tabular-nums">{row.closePrice != null ? row.closePrice.toFixed(4) : '—'}</td>
                    <td className={`text-right py-2 px-2 tabular-nums ${(row.pnl ?? 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {row.pnl != null ? (row.pnl >= 0 ? '+' : '') + row.pnl.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 px-2 text-xs" style={{ color: 'var(--text-muted)' }}>{row.closeTime ? new Date(row.closeTime).toLocaleString('ru-RU') : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
