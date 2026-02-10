import { useState } from 'react';
import { api } from '../../utils/api';
import { setAdminToken } from '../../utils/adminApi';

interface AdminLoginProps {
  onSuccess: () => void;
}

export default function AdminLogin({ onSuccess }: AdminLoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ ok?: boolean; token?: string; error?: string }>('/admin/login', { password });
      if (res.ok && res.token) {
        setAdminToken(res.token);
        onSuccess();
      } else {
        setError((res as { error?: string }).error || 'Ошибка входа');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
      <div
        className="w-full max-w-md rounded-2xl border p-8"
        style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}
      >
        <h1 className="text-2xl font-bold tracking-tight mb-2">Админ-панель</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          CryptoSignal Pro — центр управления
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2"
              style={{
                background: 'var(--bg-base)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
              placeholder="Введите пароль"
              autoFocus
              disabled={loading}
            />
          </div>
          {error && (
            <p className="text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
