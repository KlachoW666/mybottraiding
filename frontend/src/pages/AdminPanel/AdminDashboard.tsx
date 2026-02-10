import { useState, useEffect } from 'react';
import { adminApi, clearAdminToken } from '../../utils/adminApi';
import { api } from '../../utils/api';

interface DashboardData {
  system: {
    online: boolean;
    autoTrading: 'active' | 'inactive';
    websocket: string;
    okxApi: string;
    database: string;
    databaseMode?: 'sqlite' | 'memory';
    uptimeSeconds: number;
  };
  trading: {
    totalTrades24h: number;
    winRate: number;
    wins: number;
    losses: number;
    totalPnl: number;
    totalPnlPercent: number;
    bestTrade: { pnl: number; pair: string } | null;
    worstTrade: { pnl: number; pair: string } | null;
    openPositionsCount: number;
    openPositions: unknown[];
  };
  activeSignals: Array<{ symbol: string; direction: string; confidence: number; trigger: string }>;
  risk: {
    dailyDrawdownPercent: number;
    dailyDrawdownLimitPercent: number;
    openPositions: number;
    maxPositions: number;
    consecutiveLosses: number;
    maxConsecutiveLosses: number;
    canOpenTrade: boolean;
    reason: string;
  };
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}ч ${m}м ${s}с`;
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      const d = await adminApi.get<DashboardData>('/admin/dashboard');
      setData(d);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      if (String(e).includes('401')) clearAdminToken();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const id = setInterval(fetchDashboard, 10000);
    return () => clearInterval(id);
  }, []);

  const stopTrading = async () => {
    setActionLoading('stop');
    try {
      await adminApi.post('/admin/trading/stop');
      await fetchDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setActionLoading(null);
    }
  };

  const emergencyStop = async () => {
    setActionLoading('emergency');
    try {
      await adminApi.post('/admin/trading/emergency');
      await fetchDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8">
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <button
          type="button"
          onClick={() => { clearAdminToken(); window.location.reload(); }}
          className="mt-4 px-4 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
        >
          Выйти и обновить
        </button>
      </div>
    );
  }

  const d = data!;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <h2 className="text-xl font-bold tracking-tight">Dashboard</h2>

      {error && (
        <div className="p-4 rounded-xl border" style={{ background: 'var(--danger-dim)', borderColor: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* System Status */}
        <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className={d.system.online ? 'text-[var(--success)]' : ''}>🟢</span> System Status
          </h3>
          <ul className="space-y-2 text-sm">
            <li>System: {d.system.online ? 'ONLINE' : 'OFFLINE'}</li>
            <li>Auto-Trading: {d.system.autoTrading === 'active' ? 'ACTIVE' : 'INACTIVE'}</li>
            <li>WebSocket: {d.system.websocket}</li>
            <li>OKX API: {d.system.okxApi}</li>
            <li>Database: {d.system.database}{d.system.databaseMode === 'memory' ? ' (in-memory)' : d.system.databaseMode === 'sqlite' ? ' (SQLite)' : ''}</li>
            <li>Uptime: {formatUptime(d.system.uptimeSeconds)}</li>
          </ul>
        </section>

        {/* Trading Summary */}
        <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold mb-4">📊 Trading Summary (24h)</h3>
          <ul className="space-y-2 text-sm">
            <li>Total Trades: {d.trading.totalTrades24h}</li>
            <li>Win Rate: {d.trading.winRate.toFixed(1)}% ({d.trading.wins}W / {d.trading.losses}L)</li>
            <li>Total PnL: {d.trading.totalPnl >= 0 ? '+' : ''}${d.trading.totalPnl.toFixed(2)} ({d.trading.totalPnlPercent >= 0 ? '+' : ''}{d.trading.totalPnlPercent.toFixed(1)}%)</li>
            {d.trading.bestTrade && <li>Best: +${d.trading.bestTrade.pnl.toFixed(2)} ({d.trading.bestTrade.pair})</li>}
            {d.trading.worstTrade && <li>Worst: ${d.trading.worstTrade.pnl.toFixed(2)} ({d.trading.worstTrade.pair})</li>}
            <li>Open Positions: {d.trading.openPositionsCount}</li>
          </ul>
        </section>

        {/* Risk Indicators */}
        <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold mb-4">🛡️ Risk Indicators</h3>
          <ul className="space-y-2 text-sm">
            <li>Daily Drawdown: {d.risk.dailyDrawdownPercent.toFixed(1)}% / {d.risk.dailyDrawdownLimitPercent}%</li>
            <li>Open Positions: {d.risk.openPositions} / {d.risk.maxPositions}</li>
            <li>Consecutive Losses: {d.risk.consecutiveLosses} / {d.risk.maxConsecutiveLosses}</li>
            <li>Can Open Trade: {d.risk.canOpenTrade ? 'Yes' : 'No'}</li>
            {d.risk.reason && <li className="text-xs" style={{ color: 'var(--text-muted)' }}>{d.risk.reason}</li>}
          </ul>
        </section>
      </div>

      {/* Active Signals */}
      <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h3 className="text-lg font-semibold mb-4">🔔 Active Signals (Top 5)</h3>
        {d.activeSignals.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Нет активных сигналов</p>
        ) : (
          <ul className="space-y-2">
            {d.activeSignals.map((s, i) => (
              <li key={i} className="flex items-center gap-4 text-sm">
                <span className={s.direction === 'LONG' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                  {s.direction === 'LONG' ? '🟢' : '🔴'} {s.symbol} {s.direction} {s.confidence}% {s.trigger}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quick Actions */}
      <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h3 className="text-lg font-semibold mb-4">⚡ Quick Actions</h3>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={stopTrading}
            disabled={actionLoading !== null}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}
          >
            {actionLoading === 'stop' ? '…' : '⏸️ PAUSE Trading'}
          </button>
          <button
            type="button"
            onClick={emergencyStop}
            disabled={actionLoading !== null}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}
          >
            {actionLoading === 'emergency' ? '…' : '🛑 EMERGENCY STOP'}
          </button>
          <button
            type="button"
            onClick={fetchDashboard}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
          >
            🔄 Обновить
          </button>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          Запуск авто-торговли: перейдите в раздел «Авто» и включите переключатель.
        </p>
      </section>
    </div>
  );
}
