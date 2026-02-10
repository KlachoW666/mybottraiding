/**
 * Admin Service — агрегация данных для админ-панели.
 */

import { getSignals } from '../routes/signals';
import { getAutoAnalyzeStatus } from '../routes/market';
import { listOrders, isMemoryStore } from '../db';
import { emotionalFilterInstance } from './emotionalFilter';
import { config } from '../config';
import { logger } from '../lib/logger';

const emotionalFilter = emotionalFilterInstance;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Qqwdsaqe2123!fade!CryptoSignalPro228';
const adminTokens = new Set<string>();

export function validateAdminPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

export function createAdminToken(): string {
  const token = 'admin_' + Date.now() + '_' + Math.random().toString(36).slice(2, 15);
  adminTokens.add(token);
  return token;
}

export function validateAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  return adminTokens.has(token);
}

export interface DashboardData {
  system: {
    online: boolean;
    autoTrading: 'active' | 'inactive';
    websocket: 'connected';
    okxApi: 'connected' | 'disconnected';
    database: 'ok' | 'error';
    databaseMode?: 'sqlite' | 'memory';
    uptimeSeconds: number;
  };
  trading: {
    totalTrades24h: number;
    winRate: number;
    wins: number;
    losses: number;
    totalPnl: number;
    totalPnlPercent: number;
    bestTrade: { pnl: number; pair: string } | null;
    worstTrade: { pnl: number; pair: string } | null;
    openPositionsCount: number;
    openPositions: Array<{ pair: string; direction: string; pnl: number; pnlPercent: number }>;
  };
  activeSignals: Array<{ symbol: string; direction: string; confidence: number; trigger: string }>;
  risk: {
    dailyDrawdownPercent: number;
    dailyDrawdownLimitPercent: number;
    openPositions: number;
    maxPositions: number;
    consecutiveLosses: number;
    maxConsecutiveLosses: number;
    canOpenTrade: boolean;
    reason: string;
  };
}

const startTime = Date.now();

export async function getDashboardData(): Promise<DashboardData> {
  const orders = listOrders({ status: 'closed', limit: 500 });
  const since24h = Date.now() - 24 * 60 * 60 * 1000;
  const orders24h = orders.filter((o) => new Date(o.open_time).getTime() >= since24h);
  const withPnl = orders24h.filter((o) => o.close_price != null && o.close_price > 0 && o.pnl != null);
  const wins = withPnl.filter((o) => (o.pnl ?? 0) > 0);
  const losses = withPnl.filter((o) => (o.pnl ?? 0) < 0);
  const totalPnl = withPnl.reduce((s, o) => s + (o.pnl ?? 0), 0);
  const totalTrades = withPnl.length;
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
  let bestTrade: { pnl: number; pair: string } | null = null;
  let worstTrade: { pnl: number; pair: string } | null = null;
  if (withPnl.length > 0) {
    const best = withPnl.reduce((a, b) => ((a.pnl ?? 0) > (b.pnl ?? 0) ? a : b));
    const worst = withPnl.reduce((a, b) => ((a.pnl ?? 0) < (b.pnl ?? 0) ? a : b));
    bestTrade = { pnl: best.pnl ?? 0, pair: best.pair };
    worstTrade = { pnl: worst.pnl ?? 0, pair: worst.pair };
  }
  const openOrders = listOrders({ status: 'open', limit: 20 });
  const efState = emotionalFilter.getState();
  const canOpen = emotionalFilter.canOpenTrade();
  const signals = getSignals(10);
  const autoStatus = getAutoAnalyzeStatus();
  const activeSignals = signals.slice(0, 5).map((s) => ({
    symbol: s.symbol ?? '',
    direction: s.direction ?? 'LONG',
    confidence: Math.round((s.confidence ?? 0) * 100),
    trigger: Array.isArray(s.triggers) && s.triggers.length ? s.triggers[0] : 'signal'
  }));

  const dayStart = efState.dayStartBalance > 0 ? efState.dayStartBalance : 1;
  const dailyDrawdownPct = ((efState.currentBalance - dayStart) / dayStart) * 100;

  let okxApi: 'connected' | 'disconnected' = 'disconnected';
  try {
    if (config.okx.hasCredentials) {
      okxApi = 'connected';
    }
  } catch {}

  let database: 'ok' | 'error' = 'ok';
  try {
    listOrders({ limit: 1 });
  } catch (e) {
    logger.warn('Admin', 'DB check failed: ' + (e as Error).message);
    database = 'error';
  }
  const databaseMode = isMemoryStore() ? 'memory' : 'sqlite';

  return {
    system: {
      online: true,
      autoTrading: autoStatus.running ? 'active' : 'inactive',
      websocket: 'connected',
      okxApi,
      database,
      databaseMode,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000)
    },
    trading: {
      totalTrades24h: totalTrades,
      winRate,
      wins: wins.length,
      losses: losses.length,
      totalPnl,
      totalPnlPercent: dayStart > 0 ? ((efState.currentBalance - dayStart) / dayStart) * 100 : 0,
      bestTrade,
      worstTrade,
      openPositionsCount: openOrders.length,
      openPositions: []
    },
    activeSignals,
    risk: {
      dailyDrawdownPercent: dailyDrawdownPct,
      dailyDrawdownLimitPercent: -5,
      openPositions: openOrders.length,
      maxPositions: 3,
      consecutiveLosses: efState.lossStreak ?? 0,
      maxConsecutiveLosses: 3,
      canOpenTrade: canOpen.allowed,
      reason: canOpen.reason ?? ''
    }
  };
}
