/**
 * API ордеров — сохранение и получение из БД (все пользователи).
 */

import { Router, Request, Response } from 'express';
import { initDb, insertOrder, updateOrderClose, listOrders } from '../db';
import { logger } from '../lib/logger';

const router = Router();

function getClientId(req: Request): string {
  const header = req.headers['x-client-id'] as string | undefined;
  const body = (req.body?.clientId as string) || (req.query?.clientId as string);
  return (header || body || 'default').trim() || 'default';
}

/** POST /api/orders — создать ордер (открытие) или обновить (закрытие) */
router.post('/', (req: Request, res: Response) => {
  try {
    initDb();
    const clientId = getClientId(req);
    const body = req.body || {};
    const id = body.id as string;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'id обязателен' });
    }
    if (body.status === 'closed' && body.closePrice != null) {
      updateOrderClose({
        id,
        closePrice: Number(body.closePrice),
        pnl: Number(body.pnl) || 0,
        pnlPercent: Number(body.pnlPercent) || 0,
        closeTime: typeof body.closeTime === 'string' ? body.closeTime : new Date().toISOString()
      });
      return res.json({ ok: true, updated: true });
    }
    insertOrder({
      id,
      clientId,
      pair: String(body.pair || ''),
      direction: body.direction === 'SHORT' ? 'SHORT' : 'LONG',
      size: Number(body.size) || 0,
      leverage: Number(body.leverage) || 1,
      openPrice: Number(body.openPrice) || 0,
      stopLoss: body.stopLoss != null ? Number(body.stopLoss) : undefined,
      takeProfit: Array.isArray(body.takeProfit) ? body.takeProfit.map(Number) : undefined,
      openTime: typeof body.openTime === 'string' ? body.openTime : new Date().toISOString(),
      status: 'open',
      autoOpened: Boolean(body.autoOpened),
      confidenceAtOpen: body.confidenceAtOpen != null ? Number(body.confidenceAtOpen) : undefined
    });
    res.json({ ok: true });
  } catch (e) {
    logger.error('Orders', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PATCH /api/orders/:id — закрыть ордер */
router.patch('/:id', (req: Request, res: Response) => {
  try {
    initDb();
    const id = req.params.id;
    const body = req.body || {};
    const closePrice = Number(body.closePrice);
    const pnl = Number(body.pnl) ?? 0;
    const pnlPercent = Number(body.pnlPercent) ?? 0;
    const closeTime = typeof body.closeTime === 'string' ? body.closeTime : new Date().toISOString();
    if (!id || !Number.isFinite(closePrice)) {
      return res.status(400).json({ error: 'id и closePrice обязательны' });
    }
    updateOrderClose({ id, closePrice, pnl, pnlPercent, closeTime });
    res.json({ ok: true });
  } catch (e) {
    logger.error('Orders', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/orders — список ордеров (всех или по clientId) */
router.get('/', (req: Request, res: Response) => {
  try {
    initDb();
    const clientId = req.query.clientId as string | undefined;
    const status = req.query.status as 'open' | 'closed' | undefined;
    const limit = Math.min(Math.max(0, Number(req.query.limit) || 100), 500);
    const rows = listOrders({ clientId, status, limit });
    const orders = rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      pair: r.pair,
      direction: r.direction,
      size: r.size,
      leverage: r.leverage,
      openPrice: r.open_price,
      closePrice: r.close_price,
      stopLoss: r.stop_loss,
      takeProfit: r.take_profit ? JSON.parse(r.take_profit) : undefined,
      pnl: r.pnl,
      pnlPercent: r.pnl_percent,
      openTime: r.open_time,
      closeTime: r.close_time,
      status: r.status,
      autoOpened: Boolean(r.auto_opened),
      confidenceAtOpen: r.confidence_at_open,
      createdAt: r.created_at
    }));
    res.json(orders);
  } catch (e) {
    logger.error('Orders', (e as Error).message);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
