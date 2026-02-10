/**
 * Auto-Trader — исполнение ордеров через OKX (флаг + testnet)
 * ROADMAP: полная автоматизация с рисками — только при AUTO_TRADING_EXECUTION_ENABLED и опционально OKX_SANDBOX.
 */

import ccxt, { Exchange } from 'ccxt';
import { config } from '../config';
import { toOkxCcxtSymbol } from '../lib/symbol';
import { normalizeSymbol } from '../lib/symbol';
import { TradingSignal } from '../types/signal';
import { emotionalFilterInstance } from './emotionalFilter';
import { logger } from '../lib/logger';

export interface ExecuteOptions {
  /** Доля баланса на позицию (0–100) */
  sizePercent: number;
  /** Плечо */
  leverage: number;
  /** Макс. открытых позиций */
  maxPositions: number;
  /** Использовать testnet (OKX demo) */
  useTestnet?: boolean;
}

export interface ExecuteResult {
  ok: boolean;
  orderId?: string;
  positionSize?: number;
  error?: string;
}

function buildExchange(useTestnet: boolean): Exchange {
  const opts: Record<string, unknown> = {
    apiKey: config.okx.apiKey,
    secret: config.okx.secret,
    password: config.okx.passphrase,
    enableRateLimit: true,
    options: {
      defaultType: 'swap',
      sandboxMode: useTestnet
    },
    timeout: 20000
  };
  if (config.proxy) (opts as any).httpsProxy = config.proxy;
  return new ccxt.okx(opts);
}

/** Получить доступный баланс (USDT) для маржи */
export async function getTradingBalance(useTestnet: boolean): Promise<number> {
  if (!config.okx.hasCredentials) return 0;
  const exchange = buildExchange(useTestnet);
  try {
    const balance = await exchange.fetchBalance();
    const usdt = (balance as any).USDT ?? balance?.usdt;
    const total = usdt?.total ?? 0;
    const free = usdt?.free ?? total;
    return typeof free === 'number' ? free : 0;
  } catch (e) {
    logger.warn('AutoTrader', 'fetchBalance failed', { error: (e as Error).message });
    return 0;
  }
}

/** Количество открытых позиций (swap) с ненулевым размером */
export async function getOpenPositionsCount(useTestnet: boolean): Promise<number> {
  if (!config.okx.hasCredentials) return 0;
  const exchange = buildExchange(useTestnet);
  try {
    const positions = await exchange.fetchPositions(['swap']);
    const withSize = positions.filter((p: any) => {
      const contracts = Number(p.contracts ?? p.contractSize ?? 0);
      const size = Number(p.info?.pos ?? p.contracts ?? 0);
      return (contracts !== 0 || size !== 0) && (p.side === 'long' || p.side === 'short');
    });
    return withSize.length;
  } catch (e) {
    logger.warn('AutoTrader', 'fetchPositions failed', { error: (e as Error).message });
    return 0;
  }
}

/**
 * Исполнить сигнал: маркет-ордер + SL/TP (TP1).
 * Проверяет: credentials, emotional filter, max positions, баланс.
 */
export async function executeSignal(
  signal: TradingSignal,
  options: ExecuteOptions
): Promise<ExecuteResult> {
  if (!config.okx.hasCredentials) {
    return { ok: false, error: 'OKX credentials not set' };
  }

  const canOpen = emotionalFilterInstance.canOpenTrade();
  if (!canOpen.allowed) {
    return { ok: false, error: canOpen.reason ?? 'Emotional filter: trading paused' };
  }

  const useTestnet = options.useTestnet ?? config.okx.sandbox;
  const openCount = await getOpenPositionsCount(useTestnet);
  if (openCount >= options.maxPositions) {
    return { ok: false, error: `Max positions (${options.maxPositions}) reached` };
  }

  const balance = await getTradingBalance(useTestnet);
  if (balance <= 0) {
    return { ok: false, error: 'No balance available' };
  }

  const symbol = normalizeSymbol(signal.symbol);
  const ccxtSymbol = toOkxCcxtSymbol(symbol) || 'BTC/USDT:USDT';
  const entryPrice = signal.entry_price ?? 0;
  const stopLoss = signal.stop_loss ?? 0;
  const takeProfit1 = Array.isArray(signal.take_profit) && signal.take_profit.length
    ? signal.take_profit[0]
    : entryPrice * (signal.direction === 'LONG' ? 1.02 : 0.98);

  const margin = (balance * options.sizePercent) / 100;
  const positionValue = margin * options.leverage;
  const amount = positionValue / entryPrice; // контракты в базе (BTC и т.д.)

  if (amount <= 0 || !Number.isFinite(amount)) {
    return { ok: false, error: 'Invalid position size' };
  }

  const exchange = buildExchange(useTestnet);

  try {
    await exchange.setLeverage(options.leverage, ccxtSymbol, { marginMode: 'isolated' });
  } catch (e) {
    logger.warn('AutoTrader', 'setLeverage failed', { symbol: ccxtSymbol, error: (e as Error).message });
  }

  const side = signal.direction === 'LONG' ? 'buy' : 'sell';
  const params: Record<string, unknown> = {
    tdMode: 'isolated'
  };
  if (stopLoss > 0) {
    params.stopLoss = {
      triggerPrice: stopLoss,
      type: 'market'
    };
  }
  if (takeProfit1 > 0 && takeProfit1 !== entryPrice) {
    params.takeProfit = {
      triggerPrice: takeProfit1,
      type: 'market'
    };
  }

  try {
    const order = await exchange.createOrder(
      ccxtSymbol,
      'market',
      side,
      amount,
      undefined,
      params
    );
    const orderId = (order as any).id ?? (order as any).orderId;
    logger.info('AutoTrader', `Order placed: ${signal.symbol} ${signal.direction}`, {
      orderId,
      amount,
      entryPrice: entryPrice,
      useTestnet
    });
    return { ok: true, orderId, positionSize: positionValue };
  } catch (e: any) {
    const errMsg = e?.message ?? String(e);
    logger.error('AutoTrader', 'createOrder failed', { symbol: signal.symbol, error: errMsg });
    return { ok: false, error: errMsg };
  }
}

/**
 * Список позиций с OKX (для UI).
 */
export async function fetchPositionsForApi(useTestnet: boolean): Promise<Array<{
  symbol: string;
  side: string;
  contracts: number;
  entryPrice: number;
  markPrice?: number;
  unrealizedPnl?: number;
  leverage: number;
}>> {
  if (!config.okx.hasCredentials) return [];
  const exchange = buildExchange(useTestnet);
  try {
    const positions = await exchange.fetchPositions(['swap']);
    return positions
      .filter((p: any) => {
        const sz = Number(p.contracts ?? p.info?.pos ?? 0);
        return sz !== 0;
      })
      .map((p: any) => ({
        symbol: p.symbol ?? p.info?.instId ?? '',
        side: p.side ?? (Number(p.info?.pos ?? 0) > 0 ? 'long' : 'short'),
        contracts: Number(p.contracts ?? p.info?.pos ?? 0),
        entryPrice: Number(p.entryPrice ?? p.info?.avgPx ?? 0),
        markPrice: p.markPrice != null ? Number(p.markPrice) : undefined,
        unrealizedPnl: p.unrealizedPnl != null ? Number(p.unrealizedPnl) : undefined,
        leverage: Number(p.leverage ?? p.info?.lever ?? 1)
      }));
  } catch (e) {
    logger.warn('AutoTrader', 'fetchPositions failed', { error: (e as Error).message });
    return [];
  }
}
