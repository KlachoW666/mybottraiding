/**
 * Регистрация и вход пользователей (без подтверждения почты).
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import {
  findUserByUsername,
  createUser,
  getUserById,
  getGroupById,
  createSession,
  findSessionUserId,
  deleteSession,
  updateUserProxy,
  updateUserGroup,
  redeemActivationKeyForUser
} from '../db/authDb';
import { logger } from '../lib/logger';

const router = Router();
const SALT_ROUNDS = 10;
const PRO_GROUP_ID = 4;
const DEFAULT_GROUP_ID = 1;

function isActivationActive(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t > Date.now();
}

function normalizeAllowedTabs(tabs: string[] | null | undefined): string[] {
  const list = Array.isArray(tabs) ? tabs.filter(Boolean) : [];
  // "activate" tab should be available for everyone
  const set = new Set<string>(list.length ? list : ['dashboard', 'settings', 'activate']);
  set.add('activate');
  return [...set];
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

export function requireAuth(req: Request, res: Response, next: () => void): void {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  const userId = findSessionUserId(token);
  if (!userId) {
    res.status(401).json({ error: 'Недействительный токен' });
    return;
  }
  (req as any).userId = userId;
  next();
}

/** POST /api/auth/register — регистрация (без подтверждения почты) */
router.post('/register', (req: Request, res: Response) => {
  try {
    const username = (req.body?.username as string)?.trim();
    const password = req.body?.password as string;
    if (!username || username.length < 2) {
      res.status(400).json({ error: 'Логин от 2 символов' });
      return;
    }
    if (!password || password.length < 4) {
      res.status(400).json({ error: 'Пароль от 4 символов' });
      return;
    }
    if (findUserByUsername(username)) {
      res.status(400).json({ error: 'Пользователь с таким логином уже есть' });
      return;
    }
    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
    const user = createUser(username, passwordHash, DEFAULT_GROUP_ID);
    const token = crypto.randomBytes(32).toString('hex');
    createSession(token, user.id);
    const group = getGroupById(user.group_id);
    const allowedTabs: string[] = normalizeAllowedTabs(group ? (JSON.parse(group.allowed_tabs) as string[]) : []);
    res.status(201).json({
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        groupId: user.group_id,
        groupName: group?.name,
        allowedTabs,
        activationExpiresAt: (user as any).activation_expires_at ?? null,
        activationActive: isActivationActive((user as any).activation_expires_at ?? null)
      }
    });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/auth/login — вход */
router.post('/login', (req: Request, res: Response) => {
  try {
    const username = (req.body?.username as string)?.trim();
    const password = req.body?.password as string;
    if (!username || !password) {
      res.status(400).json({ error: 'Логин и пароль обязательны' });
      return;
    }
    const user = findUserByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: 'Неверный логин или пароль' });
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    createSession(token, user.id);
    // auto-downgrade expired pro users
    const active = isActivationActive((user as any).activation_expires_at ?? null);
    if (!active && user.group_id === PRO_GROUP_ID) {
      updateUserGroup(user.id, DEFAULT_GROUP_ID);
      user.group_id = DEFAULT_GROUP_ID;
    }
    const group = getGroupById(user.group_id);
    const allowedTabs: string[] = normalizeAllowedTabs(group ? (JSON.parse(group.allowed_tabs) as string[]) : []);
    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        groupId: user.group_id,
        groupName: group?.name,
        allowedTabs,
        proxyUrl: user.proxy_url ?? undefined,
        activationExpiresAt: (user as any).activation_expires_at ?? null,
        activationActive: isActivationActive((user as any).activation_expires_at ?? null)
      }
    });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/auth/logout — выход (инвалидация токена) */
router.post('/logout', (req: Request, res: Response) => {
  const token = getBearerToken(req);
  if (token) deleteSession(token);
  res.json({ ok: true });
});

/** GET /api/auth/me — текущий пользователь (по токену) */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const user = getUserById(userId);
    if (!user) {
      res.status(401).json({ error: 'Пользователь не найден' });
      return;
    }
    const active = isActivationActive((user as any).activation_expires_at ?? null);
    if (!active && user.group_id === PRO_GROUP_ID) {
      updateUserGroup(user.id, DEFAULT_GROUP_ID);
      user.group_id = DEFAULT_GROUP_ID;
    }
    const group = getGroupById(user.group_id);
    const allowedTabs: string[] = normalizeAllowedTabs(group ? (JSON.parse(group.allowed_tabs) as string[]) : []);
    res.json({
      id: user.id,
      username: user.username,
      groupId: user.group_id,
      groupName: group?.name,
      allowedTabs,
      proxyUrl: user.proxy_url ?? undefined,
      activationExpiresAt: (user as any).activation_expires_at ?? null,
      activationActive: isActivationActive((user as any).activation_expires_at ?? null)
    });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PATCH /api/auth/me — обновить профиль (прокси) */
router.patch('/me', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const proxyUrl = req.body?.proxyUrl as string | undefined;
    const v = proxyUrl === undefined ? undefined : (proxyUrl === '' ? null : String(proxyUrl).trim());
    if (v !== undefined) {
      updateUserProxy(userId, v || null);
    }
    const user = getUserById(userId);
    const group = user ? getGroupById(user.group_id) : null;
    const allowedTabs: string[] = normalizeAllowedTabs(group ? (JSON.parse(group.allowed_tabs) as string[]) : []);
    res.json({
      id: user!.id,
      username: user!.username,
      groupId: user!.group_id,
      groupName: group?.name,
      allowedTabs,
      proxyUrl: user!.proxy_url ?? undefined,
      activationExpiresAt: (user as any).activation_expires_at ?? null,
      activationActive: isActivationActive((user as any).activation_expires_at ?? null)
    });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/auth/activate — активировать ключ и выдать доступ на срок */
router.post('/activate', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const key = String(req.body?.key ?? '').trim();
    if (!key) {
      res.status(400).json({ error: 'Ключ обязателен' });
      return;
    }
    const result = redeemActivationKeyForUser({ userId, key, proGroupId: PRO_GROUP_ID });
    const user = getUserById(userId);
    const group = user ? getGroupById(user.group_id) : null;
    const allowedTabs: string[] = normalizeAllowedTabs(group ? (JSON.parse(group.allowed_tabs) as string[]) : []);
    res.json({
      ok: true,
      activationExpiresAt: result.activationExpiresAt,
      activationActive: isActivationActive(result.activationExpiresAt),
      user: user ? {
        id: user.id,
        username: user.username,
        groupId: user.group_id,
        groupName: group?.name,
        allowedTabs,
        proxyUrl: user.proxy_url ?? undefined,
        activationExpiresAt: (user as any).activation_expires_at ?? null,
        activationActive: isActivationActive((user as any).activation_expires_at ?? null)
      } : null
    });
  } catch (e) {
    logger.error('Auth', (e as Error).message);
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;
