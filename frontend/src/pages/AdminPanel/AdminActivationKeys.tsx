import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../utils/adminApi';

type KeyRow = {
  id: number;
  key: string;
  durationDays: number;
  note: string | null;
  createdAt: string;
  usedByUserId: string | null;
  usedAt: string | null;
  revokedAt: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('ru-RU');
}

export default function AdminActivationKeys() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [durationDays, setDurationDays] = useState(30);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<KeyRow[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchKeys = async () => {
    try {
      const list = await adminApi.get<KeyRow[]>('/admin/activation-keys?limit=500');
      setKeys(list);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const stats = useMemo(() => {
    const total = keys.length;
    const used = keys.filter((k) => !!k.usedAt).length;
    const revoked = keys.filter((k) => !!k.revokedAt).length;
    const active = total - used - revoked;
    return { total, used, revoked, active };
  }, [keys]);

  const generate = async () => {
    setCreating(true);
    setError('');
    setCreated([]);
    try {
      const res = await adminApi.post<{ ok: boolean; keys: Array<{ id: number; key: string; durationDays: number; note: string | null; createdAt: string }> }>(
        '/admin/activation-keys/generate',
        { durationDays, count, note: note.trim() ? note.trim() : null }
      );
      const made: KeyRow[] = res.keys.map((k) => ({
        id: k.id,
        key: k.key,
        durationDays: k.durationDays,
        note: k.note,
        createdAt: k.createdAt,
        usedByUserId: null,
        usedAt: null,
        revokedAt: null
      }));
      setCreated(made);
      await fetchKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: number) => {
    setError('');
    try {
      await adminApi.post(`/admin/activation-keys/${id}/revoke`);
      await fetchKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отзыва');
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <h2 className="text-xl font-bold tracking-tight">Ключи активации</h2>

      {error && (
        <div className="p-4 rounded-xl border" style={{ background: 'var(--danger-dim)', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[180px]">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Срок (дней)</label>
            <input className="input-field w-full" type="number" min={1} max={3650} value={durationDays} onChange={(e) => setDurationDays(parseInt(e.target.value || '0', 10) || 1)} />
          </div>
          <div className="min-w-[180px]">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Количество</label>
            <input className="input-field w-full" type="number" min={1} max={100} value={count} onChange={(e) => setCount(parseInt(e.target.value || '0', 10) || 1)} />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Заметка (опционально)</label>
            <input className="input-field w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: Telegram VIP" />
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={creating}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {creating ? '…' : 'Сгенерировать'}
          </button>
        </div>

        {created.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Сгенерированные ключи</p>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {created.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-4 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="min-w-0">
                    <div className="font-mono text-sm">{k.key}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {k.durationDays} дней{note.trim() ? ` • ${note.trim()}` : ''}
                    </div>
                  </div>
                  <button type="button" onClick={() => copy(k.key)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                    Копировать
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-6" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-lg font-semibold">Список</h3>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Всего: {stats.total} • Активные: {stats.active} • Использованные: {stats.used} • Отозванные: {stats.revoked}
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>Загрузка…</div>
        ) : keys.length === 0 ? (
          <div className="py-8 text-center" style={{ color: 'var(--text-muted)' }}>Ключей нет</div>
        ) : (
          <div className="mt-4 rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {keys.map((k) => {
              const status = k.revokedAt ? 'revoked' : k.usedAt ? 'used' : 'active';
              return (
                <div key={k.id} className="px-4 py-3 border-b flex items-center justify-between gap-4" style={{ borderColor: 'var(--border)' }}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{k.key}</span>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: status === 'active' ? 'var(--success-dim)' : status === 'used' ? 'var(--bg-hover)' : 'var(--danger-dim)',
                          color: status === 'active' ? 'var(--success)' : status === 'used' ? 'var(--text-muted)' : 'var(--danger)'
                        }}
                      >
                        {status === 'active' ? 'ACTIVE' : status === 'used' ? 'USED' : 'REVOKED'}
                      </span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {k.durationDays} дней • Создан: {fmt(k.createdAt)}
                      {k.note ? ` • ${k.note}` : ''}
                      {k.usedAt ? ` • Использован: ${fmt(k.usedAt)} (${k.usedByUserId || 'user'})` : ''}
                      {k.revokedAt ? ` • Отозван: ${fmt(k.revokedAt)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => copy(k.key)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                      Copy
                    </button>
                    {!k.revokedAt && !k.usedAt && (
                      <button type="button" onClick={() => revoke(k.id)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>
                        Отозвать
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

