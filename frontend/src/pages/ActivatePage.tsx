import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

export default function ActivatePage() {
  const { token, user, fetchMe } = useAuth();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activation = useMemo(() => {
    const anyUser = user as any;
    const expiresAt = anyUser?.activationExpiresAt as string | null | undefined;
    const active = !!anyUser?.activationActive;
    return { expiresAt: expiresAt ?? null, active };
  }, [user]);

  const onActivate = async () => {
    if (!token) return;
    setError('');
    setSuccess('');
    const k = key.trim();
    if (!k) {
      setError('Введите ключ активации');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ ok: boolean; activationExpiresAt?: string; error?: string }>(
        '/auth/activate',
        { key: k },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setSuccess(res.activationExpiresAt ? `Активировано до: ${formatDate(res.activationExpiresAt)}` : 'Активировано');
        setKey('');
        await fetchMe();
        try {
          (window as any).__navigateTo?.('dashboard');
        } catch {}
      } else {
        setError((res as any).error || 'Ошибка активации');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка активации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="rounded-2xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h2 className="text-xl font-bold tracking-tight">Активация доступа</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
          Введите ключ, который выдал супер-администратор. После активации откроются дополнительные вкладки на заданный срок.
        </p>

        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Ключ
          </label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Например: ABCD... "
            className="input-field w-full"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={onActivate}
            disabled={loading || !token}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {loading ? '…' : 'Активировать'}
          </button>
          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          {success && <p className="text-sm" style={{ color: 'var(--success)' }}>{success}</p>}
        </div>
      </div>

      <div className="rounded-2xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h3 className="text-lg font-semibold">Статус</h3>
        {!activation.expiresAt ? (
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Доступ не активирован.
          </p>
        ) : (
          <div className="text-sm mt-2 space-y-1" style={{ color: 'var(--text-secondary)' }}>
            <div>Активно: <b>{activation.active ? 'Да' : 'Нет'}</b></div>
            <div>Действует до: <b>{formatDate(activation.expiresAt)}</b></div>
          </div>
        )}
      </div>
    </div>
  );
}

