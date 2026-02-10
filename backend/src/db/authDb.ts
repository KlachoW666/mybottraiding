/**
 * Пользователи, группы, сессии — для регистрации и Super-Admin.
 * При in-memory режиме БД использует память (данные теряются при перезапуске).
 */

import { getDb, initDb, isMemoryStore } from './index';

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  group_id: number;
  proxy_url: string | null;
  activation_expires_at?: string | null;
  created_at: string;
}

export interface GroupRow {
  id: number;
  name: string;
  allowed_tabs: string;
}

const memoryUsers: UserRow[] = [];
const memoryGroups: GroupRow[] = [
  { id: 1, name: 'user', allowed_tabs: '["dashboard","settings","activate"]' },
  { id: 2, name: 'viewer', allowed_tabs: '["dashboard","signals","chart"]' },
  { id: 3, name: 'admin', allowed_tabs: '["dashboard","signals","chart","demo","autotrade","scanner","pnl","settings","admin"]' },
  { id: 4, name: 'pro', allowed_tabs: '["dashboard","signals","chart","demo","autotrade","scanner","pnl","settings","activate"]' }
];
const memorySessions: Map<string, string> = new Map(); // token -> userId
const memoryActivationKeys: ActivationKeyRow[] = [];

function ensureAuthTables(): void {
  initDb();
  const db = getDb();
  if (!db) return;
  // Таблицы создаются из schema.sql при initDb
}

export interface ActivationKeyRow {
  id: number;
  key: string;
  duration_days: number;
  note: string | null;
  created_at: string;
  used_by_user_id: string | null;
  used_at: string | null;
  revoked_at: string | null;
}

export function findUserByUsername(username: string): UserRow | null {
  ensureAuthTables();
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
    return u ?? null;
  }
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  return (row as UserRow) ?? null;
}

export function createUser(username: string, passwordHash: string, groupId = 1): UserRow {
  ensureAuthTables();
  const id = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
  const created_at = new Date().toISOString();
  if (isMemoryStore()) {
    const row: UserRow = { id, username: username.trim(), password_hash: passwordHash, group_id: groupId, proxy_url: null, activation_expires_at: null, created_at };
    memoryUsers.push(row);
    return row;
  }
  const db = getDb();
  if (!db) throw new Error('DB unavailable');
  db.prepare(
    'INSERT INTO users (id, username, password_hash, group_id, activation_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, username.trim(), passwordHash, groupId, null, created_at);
  return { id, username: username.trim(), password_hash: passwordHash, group_id: groupId, proxy_url: null, activation_expires_at: null, created_at };
}

export function getUserById(id: string): UserRow | null {
  ensureAuthTables();
  if (isMemoryStore()) {
    return memoryUsers.find((x) => x.id === id) ?? null;
  }
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return (row as UserRow) ?? null;
}

export function updateUserGroup(userId: string, groupId: number): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.id === userId);
    if (u) u.group_id = groupId;
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE users SET group_id = ? WHERE id = ?').run(groupId, userId);
}

export function updateUserProxy(userId: string, proxyUrl: string | null): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.id === userId);
    if (u) u.proxy_url = proxyUrl;
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE users SET proxy_url = ? WHERE id = ?').run(proxyUrl ?? null, userId);
}

export function updateUserActivationExpiresAt(userId: string, activationExpiresAt: string | null): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    const u = memoryUsers.find((x) => x.id === userId);
    if (u) u.activation_expires_at = activationExpiresAt;
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE users SET activation_expires_at = ? WHERE id = ?').run(activationExpiresAt ?? null, userId);
}

export function getGroupById(id: number): GroupRow | null {
  ensureAuthTables();
  if (isMemoryStore()) {
    return memoryGroups.find((g) => g.id === id) ?? null;
  }
  const db = getDb();
  if (!db) return memoryGroups.find((g) => g.id === id) ?? null;
  const row = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  return (row as GroupRow) ?? null;
}

export function listGroups(): GroupRow[] {
  ensureAuthTables();
  if (isMemoryStore()) return [...memoryGroups];
  const db = getDb();
  if (!db) return [...memoryGroups];
  return db.prepare('SELECT * FROM groups ORDER BY id').all() as GroupRow[];
}

export function updateGroupTabs(groupId: number, allowedTabs: string): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    const g = memoryGroups.find((x) => x.id === groupId);
    if (g) g.allowed_tabs = allowedTabs;
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE groups SET allowed_tabs = ? WHERE id = ?').run(allowedTabs, groupId);
}

export function createSession(token: string, userId: string): void {
  ensureAuthTables();
  if (isMemoryStore()) {
    memorySessions.set(token, userId);
    return;
  }
  const db = getDb();
  if (db) db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
}

export function findSessionUserId(token: string): string | null {
  ensureAuthTables();
  if (isMemoryStore()) return memorySessions.get(token) ?? null;
  const db = getDb();
  if (!db) return null;
  const row = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  return (row as { user_id: string } | undefined)?.user_id ?? null;
}

export function deleteSession(token: string): void {
  if (isMemoryStore()) {
    memorySessions.delete(token);
    return;
  }
  const db = getDb();
  if (db) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function listUsers(): (UserRow & { group_name?: string })[] {
  ensureAuthTables();
  if (isMemoryStore()) {
    return memoryUsers.map((u) => {
      const g = memoryGroups.find((g) => g.id === u.group_id);
      return { ...u, group_name: g?.name };
    });
  }
  const db = getDb();
  if (!db) return [];
  const rows = db.prepare(
    'SELECT u.*, g.name AS group_name FROM users u LEFT JOIN groups g ON u.group_id = g.id ORDER BY u.created_at DESC'
  ).all() as (UserRow & { group_name?: string })[];
  return rows;
}

function randomKey(): string {
  // 24 chars, upper + digits, easy to read/copy
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 24; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function createActivationKeys(opts: { durationDays: number; count?: number; note?: string | null }): ActivationKeyRow[] {
  ensureAuthTables();
  const durationDays = Math.max(1, Math.floor(opts.durationDays));
  const count = Math.max(1, Math.min(100, Math.floor(opts.count ?? 1)));
  const note = opts.note ?? null;

  const created: ActivationKeyRow[] = [];
  const now = new Date().toISOString();

  if (isMemoryStore()) {
    for (let i = 0; i < count; i++) {
      const key = randomKey();
      const id = (memoryActivationKeys[memoryActivationKeys.length - 1]?.id ?? 0) + 1;
      const row: ActivationKeyRow = {
        id,
        key,
        duration_days: durationDays,
        note,
        created_at: now,
        used_by_user_id: null,
        used_at: null,
        revoked_at: null
      };
      memoryActivationKeys.push(row);
      created.push(row);
    }
    return created;
  }

  const db = getDb();
  if (!db) throw new Error('DB unavailable');
  const insert = db.prepare(
    'INSERT INTO activation_keys (key, duration_days, note, created_at) VALUES (?, ?, ?, ?)'
  );

  for (let i = 0; i < count; i++) {
    // retry on extremely rare collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const key = randomKey();
      try {
        const info = insert.run(key, durationDays, note, now);
        const id = Number(info.lastInsertRowid);
        const row: ActivationKeyRow = {
          id,
          key,
          duration_days: durationDays,
          note,
          created_at: now,
          used_by_user_id: null,
          used_at: null,
          revoked_at: null
        };
        created.push(row);
        break;
      } catch (e) {
        if (String(e).toLowerCase().includes('unique') && attempt < 4) continue;
        throw e;
      }
    }
  }
  return created;
}

export function listActivationKeys(limit = 500): ActivationKeyRow[] {
  ensureAuthTables();
  const l = Math.max(1, Math.min(2000, Math.floor(limit)));
  if (isMemoryStore()) {
    const list = [...memoryActivationKeys];
    list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return list.slice(0, l);
  }
  const db = getDb();
  if (!db) return [];
  return db.prepare('SELECT * FROM activation_keys ORDER BY created_at DESC LIMIT ?').all(l) as ActivationKeyRow[];
}

export function revokeActivationKey(id: number): void {
  ensureAuthTables();
  const now = new Date().toISOString();
  if (isMemoryStore()) {
    const k = memoryActivationKeys.find((x) => x.id === id);
    if (k) k.revoked_at = now;
    return;
  }
  const db = getDb();
  if (db) db.prepare('UPDATE activation_keys SET revoked_at = ? WHERE id = ?').run(now, id);
}

export function redeemActivationKeyForUser(opts: { userId: string; key: string; proGroupId?: number }): { activationExpiresAt: string; groupId: number } {
  ensureAuthTables();
  const proGroupId = opts.proGroupId ?? 4;
  const key = (opts.key || '').trim().toUpperCase();
  if (!key) throw new Error('Ключ обязателен');

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const getNextExpiry = (current: string | null | undefined, durationDays: number) => {
    const baseMs = current ? Math.max(nowMs, Date.parse(current) || 0) : nowMs;
    const nextMs = baseMs + durationDays * 24 * 60 * 60 * 1000;
    return new Date(nextMs).toISOString();
  };

  if (isMemoryStore()) {
    const k = memoryActivationKeys.find((x) => x.key === key) ?? null;
    if (!k) throw new Error('Ключ не найден');
    if (k.revoked_at) throw new Error('Ключ отозван');
    if (k.used_at) throw new Error('Ключ уже использован');
    const u = memoryUsers.find((x) => x.id === opts.userId);
    if (!u) throw new Error('Пользователь не найден');
    k.used_at = nowIso;
    k.used_by_user_id = opts.userId;
    const activationExpiresAt = getNextExpiry(u.activation_expires_at ?? null, k.duration_days);
    u.activation_expires_at = activationExpiresAt;
    u.group_id = proGroupId;
    return { activationExpiresAt, groupId: proGroupId };
  }

  const db = getDb();
  if (!db) throw new Error('DB unavailable');

  const tx = db.transaction(() => {
    const k = db.prepare('SELECT * FROM activation_keys WHERE key = ?').get(key) as ActivationKeyRow | undefined;
    if (!k) throw new Error('Ключ не найден');
    if (k.revoked_at) throw new Error('Ключ отозван');
    if (k.used_at) throw new Error('Ключ уже использован');

    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(opts.userId) as UserRow | undefined;
    if (!u) throw new Error('Пользователь не найден');

    db.prepare('UPDATE activation_keys SET used_by_user_id = ?, used_at = ? WHERE id = ?').run(opts.userId, nowIso, k.id);

    const activationExpiresAt = getNextExpiry((u as any).activation_expires_at ?? null, k.duration_days);
    db.prepare('UPDATE users SET activation_expires_at = ?, group_id = ? WHERE id = ?').run(activationExpiresAt, proGroupId, opts.userId);
    return { activationExpiresAt, groupId: proGroupId };
  });

  return tx();
}
