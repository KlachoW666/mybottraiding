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
  created_at: string;
}

export interface GroupRow {
  id: number;
  name: string;
  allowed_tabs: string;
}

const memoryUsers: UserRow[] = [];
const memoryGroups: GroupRow[] = [
  { id: 1, name: 'user', allowed_tabs: '["dashboard","settings"]' },
  { id: 2, name: 'viewer', allowed_tabs: '["dashboard","signals","chart"]' },
  { id: 3, name: 'admin', allowed_tabs: '["dashboard","signals","chart","demo","autotrade","scanner","pnl","settings","admin"]' }
];
const memorySessions: Map<string, string> = new Map(); // token -> userId

function ensureAuthTables(): void {
  initDb();
  const db = getDb();
  if (!db) return;
  // Таблицы создаются из schema.sql при initDb
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
    const row: UserRow = { id, username: username.trim(), password_hash: passwordHash, group_id: groupId, proxy_url: null, created_at };
    memoryUsers.push(row);
    return row;
  }
  const db = getDb();
  if (!db) throw new Error('DB unavailable');
  db.prepare(
    'INSERT INTO users (id, username, password_hash, group_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, username.trim(), passwordHash, groupId, created_at);
  return { id, username: username.trim(), password_hash: passwordHash, group_id: groupId, proxy_url: null, created_at };
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
