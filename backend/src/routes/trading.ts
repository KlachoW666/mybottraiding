/**
 * Trading state API — Emotional Filter (cooldown, drawdown, streak)
 */

import { Router, Request, Response } from 'express';
import { emotionalFilterInstance } from '../services/emotionalFilter';
import { setNotificationConfig, getNotificationConfig } from '../services/notificationService';
import { fetchPositionsForApi, getTradingBalance, getOpenPositionsCount } from '../services/autoTrader';
import { config } from '../config';
import { logger } from '../lib/logger';

const router = Router();
const emotionalFilter = emotionalFilterInstance;

/**
 * GET /api/trading/state
 * Текущее состояние Emotional Filter
 */
router.get('/state', (_req: Request, res: Response) => {
  try {
    const state = emotionalFilter.getState();
    const canOpen = emotionalFilter.canOpenTrade();
    res.json({ state, canOpenTrade: canOpen.allowed, reason: canOpen.reason });
  } catch (error) {
    logger.error('Trading', '/state error', { error });
    res.status(500).json({ error: 'Failed to get state' });
  }
});

/**
 * POST /api/trading/outcome
 * Записать результат сделки (pnl) для Emotional Filter
 * Body: { pnl: number }
 */
router.post('/outcome', (req: Request, res: Response) => {
  try {
    const pnl = Number(req.body?.pnl);
    if (typeof pnl !== 'number' || Number.isNaN(pnl)) {
      res.status(400).json({ error: 'pnl (number) required' });
      return;
    }
    emotionalFilter.recordTradeOutcome(pnl);
    res.json({ ok: true, state: emotionalFilter.getState() });
  } catch (error) {
    logger.error('Trading', '/outcome error', { error });
    res.status(500).json({ error: 'Failed to record outcome' });
  }
});

/**
 * POST /api/trading/set-balance
 * Установить баланс дня (при старте)
 * Body: { balance: number }
 */
router.post('/set-balance', (req: Request, res: Response) => {
  try {
    const balance = Number(req.body?.balance);
    if (typeof balance !== 'number' || Number.isNaN(balance) || balance < 0) {
      res.status(400).json({ error: 'balance (positive number) required' });
      return;
    }
    emotionalFilter.setBalance(balance);
    res.json({ ok: true, state: emotionalFilter.getState() });
  } catch (error) {
    logger.error('Trading', '/set-balance error', { error });
    res.status(500).json({ error: 'Failed to set balance' });
  }
});

/**
 * POST /api/trading/reset
 * Сброс Emotional Filter (cooldown и daily stop)
 */
router.post('/reset', (_req: Request, res: Response) => {
  try {
    emotionalFilter.reset();
    res.json({ ok: true, state: emotionalFilter.getState() });
  } catch (error) {
    logger.error('Trading', '/reset error', { error });
    res.status(500).json({ error: 'Failed to reset' });
  }
});

/**
 * GET /api/trading/notifications
 * Текущая конфигурация уведомлений (без секретов)
 */
router.get('/notifications', (_req: Request, res: Response) => {
  const cfg = getNotificationConfig();
  res.json({
    telegram: !!cfg.telegram?.botToken && !!cfg.telegram?.chatId,
    discord: !!cfg.discord?.webhookUrl
  });
});

/**
 * GET /api/trading/positions
 * Позиции на OKX (при включённом исполнении). Query: useTestnet=true|false
 */
router.get('/positions', async (req: Request, res: Response) => {
  try {
    if (!config.okx.hasCredentials) {
      res.json({ positions: [], balance: 0, openCount: 0, executionAvailable: false });
      return;
    }
    const useTestnet = req.query.useTestnet !== 'false';
    const [positions, balance, openCount] = await Promise.all([
      fetchPositionsForApi(useTestnet),
      getTradingBalance(useTestnet),
      getOpenPositionsCount(useTestnet)
    ]);
    res.json({
      positions,
      balance,
      openCount,
      executionAvailable: config.autoTradingExecutionEnabled,
      useTestnet
    });
  } catch (error) {
    logger.error('Trading', '/positions error', { error });
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

/**
 * GET /api/trading/execution-config
 * Доступно ли исполнение и testnet (без секретов)
 */
router.get('/execution-config', (_req: Request, res: Response) => {
  res.json({
    executionEnabled: config.autoTradingExecutionEnabled,
    hasCredentials: config.okx.hasCredentials,
    defaultTestnet: config.okx.sandbox
  });
});

/**
 * POST /api/trading/notifications
 * Установить конфигурацию уведомлений
 * Body: { telegram?: { botToken, chatId }, discord?: { webhookUrl } }
 */
router.post('/notifications', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      telegram?: { botToken?: string; chatId?: string };
      discord?: { webhookUrl?: string };
    };
    setNotificationConfig({
      telegram: body.telegram?.botToken && body.telegram?.chatId ? body.telegram as { botToken: string; chatId: string } : undefined,
      discord: body.discord?.webhookUrl ? { webhookUrl: body.discord.webhookUrl } : undefined
    });
    res.json({ ok: true });
  } catch (error) {
    logger.error('Trading', '/notifications error', { error });
    res.status(500).json({ error: 'Failed to set notifications' });
  }
});

export default router;
export { emotionalFilter };
