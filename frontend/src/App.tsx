import { useState, useEffect, useMemo } from 'react';
import Dashboard from './pages/Dashboard';
import SignalFeed from './pages/SignalFeed';
import ChartView from './pages/ChartView';
import DemoPage from './pages/DemoPage';
import AutoTradingPage from './pages/AutoTradingPage';
import SettingsPage from './pages/SettingsPage';
import PnlCalculatorPage from './pages/PnlCalculatorPage';
import ScannerPage from './pages/ScannerPage';
import ActivatePage from './pages/ActivatePage';
import AdminPanel from './pages/AdminPanel';
import AuthPage from './pages/AuthPage';
import { getSavedPage, savePage } from './store/appStore';
import { useNotifications } from './contexts/NotificationContext';
import { useAuth } from './contexts/AuthContext';
import { getSettings } from './store/settingsStore';

type Page = 'dashboard' | 'signals' | 'chart' | 'demo' | 'autotrade' | 'scanner' | 'pnl' | 'settings' | 'activate' | 'admin';

const ALL_PAGES: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Обзор', icon: '◉' },
  { id: 'signals', label: 'Сигналы', icon: '◈' },
  { id: 'chart', label: 'График', icon: '▣' },
  { id: 'demo', label: 'Демо', icon: '◆' },
  { id: 'autotrade', label: 'Авто', icon: '◇' },
  { id: 'scanner', label: 'Скринер', icon: '▤' },
  { id: 'pnl', label: 'PNL', icon: '💰' },
  { id: 'settings', label: 'Настройки', icon: '⚙' },
  { id: 'activate', label: 'Активировать', icon: '🔑' },
  { id: 'admin', label: 'Админ', icon: '🎛' }
];

function useSignalToasts() {
  const { addToast } = useNotifications();

  useEffect(() => {
    const wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'BREAKOUT_ALERT' && msg.data) {
          const d = msg.data as { symbol?: string; breakout?: { direction?: string; confidence?: number } };
          const conf = ((d.breakout?.confidence ?? 0) * 100).toFixed(0);
          addToast({
            type: 'signal',
            title: `Пробой: ${d.symbol || '?'} — ${d.breakout?.direction || '?'}`,
            message: `Уверенность ${conf}%`,
            duration: 6000
          });
        } else if (msg.type === 'signal' && msg.data) {
          const payload = msg.data as { symbol?: string; direction?: string; confidence?: number; entry_price?: number; signal?: { symbol?: string; direction?: string; confidence?: number; entry_price?: number } };
          const s = payload.signal ?? payload;
          const conf = (s.confidence ?? 0) * 100;
          const cfg = getSettings().notifications;
          if (conf < (cfg?.minConfidence ?? 75)) return;
          if (s.direction === 'LONG' && !cfg?.long) return;
          if (s.direction === 'SHORT' && !cfg?.short) return;
          addToast({
            type: 'signal',
            title: `${s.symbol ?? '?'} — ${s.direction ?? '?'}`,
            message: `Вход: ${(s.entry_price ?? 0).toLocaleString('ru-RU')} • Уверенность: ${conf.toFixed(0)}%`,
            duration: 6000
          });
          if (cfg?.sound) {
            try {
              const ac = new AudioContext();
              const o = ac.createOscillator();
              const g = ac.createGain();
              o.connect(g);
              g.connect(ac.destination);
              o.frequency.value = 880;
              g.gain.setValueAtTime(0.1, ac.currentTime);
              g.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.15);
              o.start(ac.currentTime);
              o.stop(ac.currentTime + 0.15);
            } catch {}
          }
          if (cfg?.desktop && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(`${s.symbol ?? '?'} ${s.direction ?? '?'}`, {
              body: `Вход: ${(s.entry_price ?? 0).toLocaleString('ru-RU')} • ${conf.toFixed(0)}%`,
              icon: '/favicon.ico'
            });
          }
        }
      } catch {}
    };
    return () => ws.close();
  }, [addToast]);
}

const FALLBACK_TABS: Page[] = ['dashboard', 'settings'];

export default function App() {
  const { user, loading, logout } = useAuth();
  const allowedSet = useMemo(() => {
    const tabs = user?.allowedTabs ?? [];
    const set = new Set(tabs.length > 0 ? tabs : FALLBACK_TABS);
    return set;
  }, [user?.allowedTabs]);
  const PAGES = useMemo(() => {
    const list = ALL_PAGES.filter((p) => allowedSet.has(p.id));
    return list.length > 0 ? list : ALL_PAGES.filter((p) => p.id !== 'admin');
  }, [allowedSet]);

  const [page, setPage] = useState<Page>(() => {
    const saved = getSavedPage() as Page | null;
    const allowed = new Set<Page>((user?.allowedTabs?.length ? user.allowedTabs : FALLBACK_TABS) as Page[]);
    if (saved && allowed.has(saved)) return saved;
    if (allowed.has('dashboard')) return 'dashboard';
    const first = (user?.allowedTabs?.length ? user.allowedTabs[0] : 'dashboard') as Page;
    return allowed.has(first) ? first : 'dashboard';
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const { toasts, clearAll } = useNotifications();

  useSignalToasts();

  useEffect(() => {
    if (user) {
      const allowed = new Set((user.allowedTabs?.length ? user.allowedTabs : FALLBACK_TABS) as Page[]);
      setPage((prev) => {
        const valid = allowed.has(prev) ? prev : (allowed.has('dashboard') ? 'dashboard' : (PAGES[0]?.id ?? 'dashboard'));
        return valid as Page;
      });
    }
  }, [user?.id]);

  useEffect(() => {
    if (user && !allowedSet.has(page)) {
      setPage('dashboard');
    }
  }, [user, page, allowedSet]);

  useEffect(() => {
    savePage(page);
  }, [page]);

  const setPageSafe = (p: Page) => {
    if (allowedSet.has(p)) setPage(p);
  };
  useEffect(() => {
    (window as any).__navigateTo = setPageSafe;
    return () => { delete (window as any).__navigateTo; };
  }, [allowedSet]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const target: Page | null =
          e.key === '1' ? 'dashboard' : e.key === '2' ? 'signals' : e.key === '3' ? 'chart' :
          e.key === '4' ? 'demo' : e.key === '5' ? 'autotrade' : e.key === '6' ? 'scanner' :
          e.key === '7' ? 'pnl' : e.key === ',' ? 'settings' : e.key === '9' ? 'activate' : e.key === '8' ? 'admin' : null;
        if (target && allowedSet.has(target)) {
          setPage(target);
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allowedSet]);

  const safePage = allowedSet.has(page) ? page : 'dashboard';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      </div>
    );
  }
  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Top bar — Cryptory style */}
      <header
        className="shrink-0 h-14 px-6 md:px-8 lg:px-10 flex items-center justify-between border-b"
        style={{ background: 'var(--bg-topbar)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded flex items-center justify-center font-bold text-lg"
            style={{ background: 'var(--accent-gradient)', color: 'white', letterSpacing: '-0.05em' }}
          >
            C
          </div>
          <h1 className="text-lg font-semibold tracking-tight">CryptoSignal Pro</h1>
        </div>
        <nav className="flex items-center gap-1">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPage(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all relative ${
                safePage === p.id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {p.label}
              {safePage === p.id && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />
              )}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{user.username}</span>
          <button
            type="button"
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-full transition-colors hover:bg-[var(--bg-hover)]"
            style={{ background: toasts.length > 0 ? 'var(--accent-dim)' : 'transparent' }}
          >
            <span className="text-lg">🔔</span>
            {toasts.length > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: 'var(--accent)', color: 'var(--bg-base)' }}
              >
                {Math.min(toasts.length, 99)}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={logout}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            Выйти
          </button>
        </div>
      </header>

      {notifOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
          <div
            className="fixed right-6 top-16 w-72 rounded-lg border z-50 overflow-hidden"
            style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="px-4 py-3 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
              <span className="font-semibold text-sm">Уведомления</span>
              {toasts.length > 0 && (
                <button type="button" onClick={clearAll} className="text-xs hover:opacity-80" style={{ color: 'var(--accent)' }}>
                  Очистить
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {toasts.length === 0 ? (
                <p className="px-5 py-4 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>Нет уведомлений</p>
              ) : (
                toasts.slice().reverse().map((t) => (
                  <div
                    key={t.id}
                    className="px-4 py-3 border-b hover:bg-[var(--bg-hover)] transition-colors"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <p className="font-medium text-sm leading-snug">{t.title}</p>
                    {t.message && <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{t.message}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <main className="flex-1 min-h-0 overflow-auto py-8 px-8 md:px-12 lg:px-16">
        <div className={safePage === 'dashboard' ? 'block' : 'hidden'}>
          <Dashboard />
        </div>
        <div className={safePage === 'signals' ? 'block' : 'hidden'}>
          <SignalFeed />
        </div>
        <div className={safePage === 'chart' ? 'block' : 'hidden'}>
          {safePage === 'chart' && <ChartView />}
        </div>
        <div className={safePage === 'demo' ? 'block' : 'hidden'}>
          <DemoPage />
        </div>
        <div className={safePage === 'autotrade' ? 'block' : 'hidden'}>
          <AutoTradingPage />
        </div>
        <div className={safePage === 'scanner' ? 'block' : 'hidden'}>
          <ScannerPage />
        </div>
        <div className={safePage === 'pnl' ? 'block' : 'hidden'}>
          <PnlCalculatorPage />
        </div>
        <div className={safePage === 'settings' ? 'block' : 'hidden'}>
          <SettingsPage />
        </div>
        <div className={safePage === 'activate' ? 'block' : 'hidden'}>
          <ActivatePage />
        </div>
        <div className={safePage === 'admin' ? 'block' : 'hidden'}>
          <AdminPanel />
        </div>
      </main>
    </div>
  );
}
