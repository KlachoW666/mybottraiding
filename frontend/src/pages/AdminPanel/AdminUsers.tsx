import { useState, useEffect } from 'react';
import { adminApi, clearAdminToken } from '../../utils/adminApi';

interface UserRow {
  id: string;
  username: string;
  groupId: number;
  groupName?: string;
  createdAt: string;
}

interface GroupRow {
  id: number;
  name: string;
  allowedTabs: string[];
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [u, g] = await Promise.all([
        adminApi.get<UserRow[]>('/admin/users'),
        adminApi.get<GroupRow[]>('/admin/groups')
      ]);
      setUsers(u);
      setGroups(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      if (String(e).includes('401')) clearAdminToken();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const changeGroup = async (userId: string, groupId: number) => {
    setUpdating(userId);
    setError('');
    try {
      await adminApi.put(`/admin/users/${userId}`, { groupId });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, groupId, groupName: groups.find((g) => g.id === groupId)?.name } : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-xl font-bold tracking-tight">Пользователи и группы (Super-Admin)</h2>
      {error && (
        <div className="p-4 rounded-xl border" style={{ background: 'var(--danger-dim)', borderColor: 'var(--danger)' }}>
          {error}
        </div>
      )}
      <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card-solid)', borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderColor: 'var(--border)', background: 'var(--bg-hover)' }}>
              <th className="text-left p-3">Логин</th>
              <th className="text-left p-3">Группа</th>
              <th className="text-left p-3">Дата</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderColor: 'var(--border)' }} className="border-t">
                <td className="p-3 font-medium">{u.username}</td>
                <td className="p-3">
                  <select
                    value={u.groupId}
                    onChange={(e) => changeGroup(u.id, Number(e.target.value))}
                    disabled={updating === u.id}
                    className="input-field py-1.5 text-sm"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </td>
                <td className="p-3" style={{ color: 'var(--text-muted)' }}>{new Date(u.createdAt).toLocaleString('ru-RU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>Нет пользователей</p>
        )}
      </div>
    </div>
  );
}
