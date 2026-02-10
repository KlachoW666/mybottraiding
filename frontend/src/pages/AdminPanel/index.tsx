import { useState, useEffect } from 'react';
import { isAdminAuthenticated, clearAdminToken } from '../../utils/adminApi';
import AdminLogin from './AdminLogin';
import AdminDashboard from './AdminDashboard';
import AdminTrading from './AdminTrading';
import AdminAnalytics from './AdminAnalytics';
import AdminLogs from './AdminLogs';
import AdminUsers from './AdminUsers';
import AdminGroups from './AdminGroups';
import AdminActivationKeys from './AdminActivationKeys';

type AdminTab = 'dashboard' | 'trading' | 'analytics' | 'logs' | 'users' | 'groups' | 'keys';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'trading', label: 'Торговля' },
  { id: 'analytics', label: 'Аналитика' },
  { id: 'logs', label: 'Логи' },
  { id: 'users', label: 'Пользователи' },
  { id: 'groups', label: 'Группы' },
  { id: 'keys', label: 'Ключи' }
];

export default function AdminPanel() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<AdminTab>('dashboard');

  useEffect(() => {
    setAuthenticated(isAdminAuthenticated());
    setChecking(false);
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      </div>
    );
  }

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen py-8 px-6 md:px-8" style={{ background: 'var(--bg-base)' }}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id ? 'text-white' : 'hover:opacity-80'
              }`}
              style={{ background: tab === t.id ? 'var(--accent)' : 'var(--bg-hover)', color: tab === t.id ? 'white' : 'var(--text-secondary)' }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { clearAdminToken(); window.location.reload(); }}
          className="text-sm px-3 py-1.5 rounded-lg hover:opacity-80"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
        >
          Выйти
        </button>
      </div>
      {tab === 'dashboard' && <AdminDashboard />}
      {tab === 'trading' && <AdminTrading />}
      {tab === 'analytics' && <AdminAnalytics />}
      {tab === 'logs' && <AdminLogs />}
      {tab === 'users' && <AdminUsers />}
      {tab === 'groups' && <AdminGroups />}
      {tab === 'keys' && <AdminActivationKeys />}
    </div>
  );
}
