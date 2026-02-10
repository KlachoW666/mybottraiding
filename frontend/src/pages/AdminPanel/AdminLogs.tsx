import { useState, useEffect } from 'react';
import { adminApi } from '../../utils/adminApi';

interface LogEntry {
  ts: string;
  level: string;
  tag: string;
  message: string;
  meta?: string;
}

export default function AdminLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLogs = () => {
    setError('');
    adminApi
      .get<{ logs: LogEntry[] }>('/admin/logs?limit=500')
      .then((data) => setLogs(data.logs ?? []))
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Ошибка загрузки');
        setLogs([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, []);

  const levelColor = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'var(--danger)';
      case 'WARN':
        return 'var(--warning)';
      case 'DEBUG':
        return 'var(--text-muted)';
      default:
        return 'var(--accent)';
    }
  };

  if (loading && logs.length === 0) {
    return <p className="p-8" style={{ color: 'var(--text-muted)' }}>Загрузка…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold tracking-tight">Логи и история</h2>
        <button
          type="button"
          onClick={() => { setLoading(true); fetchLogs(); }}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          Обновить
        </button>
      </div>
      {error && (
        <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
      )}
      <section className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <h3 className="text-lg font-semibold p-4 border-b" style={{ borderColor: 'var(--border)' }}>Системные логи</h3>
        <div
          className="overflow-auto p-4 font-mono text-xs leading-relaxed"
          style={{ maxHeight: '60vh', background: 'var(--bg-base)', color: 'var(--text-secondary)' }}
        >
          {logs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Пока нет записей. Логи появляются при работе сервера.</p>
          ) : (
            logs.map((entry, i) => (
              <div key={i} className="py-1 border-b border-[var(--border)] last:border-0">
                <span className="text-[var(--text-muted)] shrink-0">{entry.ts}</span>
                {' '}
                <span style={{ color: levelColor(entry.level), fontWeight: 600 }}>[{entry.level}]</span>
                {' '}
                <span style={{ color: 'var(--accent)' }}>[{entry.tag}]</span>
                {' '}
                {entry.message}
                {entry.meta && (
                  <span className="block mt-0.5 ml-4" style={{ color: 'var(--text-muted)' }}>{entry.meta}</span>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
