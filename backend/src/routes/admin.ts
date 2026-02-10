/**
 * Admin API — дашборд, статус, быстрые действия.
 */

import { Router, Request, Response } from 'express';
import { getDashboardData, validateAdminPassword, createAdminToken, validateAdminToken } from '../services/adminService';
import { stopAutoAnalyze } from './market';
import { listOrders } from '../db';
import { listUsers, listGroups, updateUserGroup, updateGroupTabs, createActivationKeys, listActivationKeys, revokeActivationKey } from '../db/authDb';
import { getSignals } from './signals';
import { logger, getRecentLogs } from '../lib/logger';

const router = Router();

function requireAdmin(req: Request, res: Response, next: () => void) {
  const token = req.headers['x-admin-token'] as string | undefined;
  if (!validateAdminToken(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

/** POST /api/admin/login — вход по паролю, возвращает токен */
router.post('/login', (req: Request, res: Response) => {
  try {
    const password = (req.body?.password as string) || '';
    if (!validateAdminPassword(password)) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }
    const token = createAdminToken();
    res.json({ ok: true, token });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/dashboard — данные для главной панели */
router.get('/dashboard', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/system/status — краткий статус системы */
router.get('/system/status', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const data = await getDashboardData();
    res.json(data.system);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/trading/stop — остановить авто-торговлю */
router.post('/trading/stop', requireAdmin, (_req: Request, res: Response) => {
  try {
    stopAutoAnalyze();
    res.json({ ok: true, status: 'stopped' });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/trading/emergency — экстренная остановка (стоп анализа + сброс эмоц. фильтра не делаем по умолчанию) */
router.post('/trading/emergency', requireAdmin, (_req: Request, res: Response) => {
  try {
    stopAutoAnalyze();
    res.json({ ok: true, status: 'emergency_stop' });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/trades/history — история сделок из БД */
router.get('/trades/history', requireAdmin, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const clientId = req.query.clientId as string | undefined;
    const orders = listOrders({ clientId, status: 'closed', limit });
    const history = orders.map((o) => ({
      id: o.id,
      clientId: o.client_id,
      pair: o.pair,
      direction: o.direction,
      size: o.size,
      leverage: o.leverage,
      openPrice: o.open_price,
      closePrice: o.close_price,
      stopLoss: o.stop_loss,
      takeProfit: o.take_profit ? JSON.parse(o.take_profit) : undefined,
      pnl: o.pnl,
      pnlPercent: o.pnl_percent,
      openTime: o.open_time,
      closeTime: o.close_time,
      status: o.status
    }));
    res.json(history);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/signals/history — история сигналов */
router.get('/signals/history', requireAdmin, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const signals = getSignals(limit);
    res.json(signals);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/analytics — аналитика по ордерам */
router.get('/analytics', requireAdmin, (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 500;
    const orders = listOrders({ status: 'closed', limit });
    const withPnl = orders.filter((o) => o.close_price != null && o.close_price > 0 && o.pnl != null);
    const wins = withPnl.filter((o) => (o.pnl ?? 0) > 0);
    const losses = withPnl.filter((o) => (o.pnl ?? 0) < 0);
    const totalPnl = withPnl.reduce((s, o) => s + (o.pnl ?? 0), 0);
    const totalTrades = withPnl.length;
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
    const grossProfit = wins.reduce((s, o) => s + (o.pnl ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, o) => s + (o.pnl ?? 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    res.json({
      totalTrades,
      wins: wins.length,
      losses: losses.length,
      winRate,
      totalPnl,
      grossProfit,
      grossLoss,
      profitFactor,
      bestTrade: withPnl.length ? Math.max(...withPnl.map((o) => o.pnl ?? 0)) : 0,
      worstTrade: withPnl.length ? Math.min(...withPnl.map((o) => o.pnl ?? 0)) : 0
    });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/logs — последние логи сервера из буфера */
router.get('/logs', requireAdmin, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 500, 1000);
    const entries = getRecentLogs(limit);
    res.json({ logs: entries });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ logs: [], error: (e as Error).message });
  }
});

/** ——— Super-Admin: пользователи и группы ——— */

/** GET /api/admin/users — список пользователей */
router.get('/users', requireAdmin, (_req: Request, res: Response) => {
  try {
    const users = listUsers().map((u) => ({
      id: u.id,
      username: u.username,
      groupId: u.group_id,
      groupName: u.group_name,
      createdAt: u.created_at
    }));
    res.json(users);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/admin/users/:id — назначить группу пользователю */
router.put('/users/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const groupId = parseInt(req.body?.groupId as string, 10);
    if (!userId || !Number.isInteger(groupId) || groupId < 1) {
      res.status(400).json({ error: 'groupId обязателен (число >= 1)' });
      return;
    }
    updateUserGroup(userId, groupId);
    res.json({ ok: true, userId, groupId });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/admin/groups — список групп с вкладками */
router.get('/groups', requireAdmin, (_req: Request, res: Response) => {
  try {
    const groups = listGroups().map((g) => ({
      id: g.id,
      name: g.name,
      allowedTabs: JSON.parse(g.allowed_tabs) as string[]
    }));
    res.json(groups);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/admin/groups/:id — обновить вкладки группы */
router.put('/groups/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const allowedTabs = req.body?.allowedTabs as string[] | undefined;
    if (!Number.isInteger(groupId) || groupId < 1 || !Array.isArray(allowedTabs)) {
      res.status(400).json({ error: 'allowedTabs — массив id вкладок' });
      return;
    }
    updateGroupTabs(groupId, JSON.stringify(allowedTabs));
    res.json({ ok: true, groupId, allowedTabs });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** ——— Super-Admin: ключи активации ——— */

/** GET /api/admin/activation-keys — список ключей */
router.get('/activation-keys', requireAdmin, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 500, 2000);
    const keys = listActivationKeys(limit).map((k) => ({
      id: k.id,
      key: k.key,
      durationDays: k.duration_days,
      note: k.note,
      createdAt: k.created_at,
      usedByUserId: k.used_by_user_id,
      usedAt: k.used_at,
      revokedAt: k.revoked_at
    }));
    res.json(keys);
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/activation-keys/generate — генерация ключей */
router.post('/activation-keys/generate', requireAdmin, (req: Request, res: Response) => {
  try {
    const durationDays = parseInt(req.body?.durationDays as string, 10);
    const count = req.body?.count != null ? parseInt(req.body.count as string, 10) : 1;
    const note = req.body?.note != null ? String(req.body.note) : null;
    if (!Number.isFinite(durationDays) || durationDays < 1) {
      res.status(400).json({ error: 'durationDays обязателен (число >= 1)' });
      return;
    }
    const keys = createActivationKeys({ durationDays, count, note }).map((k) => ({
      id: k.id,
      key: k.key,
      durationDays: k.duration_days,
      note: k.note,
      createdAt: k.created_at
    }));
    res.json({ ok: true, keys });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/admin/activation-keys/:id/revoke — отзыв ключа */
router.post('/activation-keys/:id/revoke', requireAdmin, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'Некорректный id' });
      return;
    }
    revokeActivationKey(id);
    res.json({ ok: true, id });
  } catch (e) {
    logger.error('Admin', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
