import ccxt, { Exchange } from 'ccxt';
import { OHLCVCandle } from '../types/candle';
import { config } from '../config';
import { toOkxCcxtSymbol } from '../lib/symbol';
import { logger } from '../lib/logger';

/**
 * Data Aggregator — OKX REST API (публичные и приватные данные)
 */
export class DataAggregator {
  private exchange: Exchange;

  constructor() {
    const { okx } = config;
    const opts: Record<string, unknown> = {
      apiKey: okx.hasCredentials ? okx.apiKey : undefined,
      secret: okx.hasCredentials ? okx.secret : undefined,
      password: okx.hasCredentials && okx.passphrase ? okx.passphrase : undefined,
      enableRateLimit: true,
      options: { defaultType: 'swap' },
      timeout: 30000, // OKX /asset/currencies и др. могут отвечать медленно
    };
    const proxyUrl = config.proxy;
    if (proxyUrl) {
      opts.httpsProxy = proxyUrl;
    }
    this.exchange = new ccxt.okx(opts);
    logger.info('DataAggregator', `OKX: public${okx.hasCredentials ? ' + trading' : ''}${proxyUrl ? ' [proxy]' : ''}`);
  }

  getExchangeIds(): string[] {
    return ['okx'];
  }

  private toCcxtSymbol(symbol: string): string {
    const s = toOkxCcxtSymbol(symbol);
    return s || 'BTC/USDT:USDT';
  }

  async getOHLCV(symbol: string, timeframe = '15m', limit = 100, _exchangeId?: string): Promise<OHLCVCandle[]> {
    return this.getOHLCVByExchange(symbol, timeframe, limit);
  }

  async getOHLCVByExchange(symbol: string, timeframe: string, limit: number): Promise<OHLCVCandle[]> {
    const ccxtSymbol = this.toCcxtSymbol(symbol);
    try {
      const data = await this.exchange.fetchOHLCV(ccxtSymbol, timeframe, undefined, limit);
      if (data?.length) {
        return data.map((row) => ({
          timestamp: Number(row[0]),
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
          volume: Number(row[5] ?? 0)
        }));
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg?.includes('does not have market symbol')) {
        logger.warn('OKX', 'OHLCV fetch failed', { symbol, error: msg });
      } else {
        logger.debug('OKX', 'OHLCV symbol not on OKX', { symbol });
      }
    }
    return this.getMockCandles(symbol, timeframe, limit);
  }

  async getOrderBook(symbol: string, limit = 20, _exchangeId?: string): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
    return this.getOrderBookByExchange(symbol, limit);
  }

  async getOrderBookByExchange(symbol: string, limit: number): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
    const ccxtSymbol = this.toCcxtSymbol(symbol);
    const okxLimit = Math.min(limit, config.limits.orderBook);
    try {
      const ob = await this.exchange.fetchOrderBook(ccxtSymbol, okxLimit);
      const bids = (ob.bids || []).slice(0, okxLimit).map(([p, a]) => [Number(p), Number(a)] as [number, number]);
      const asks = (ob.asks || []).slice(0, okxLimit).map(([p, a]) => [Number(p), Number(a)] as [number, number]);
      return { bids, asks };
    } catch (e) {
      logger.warn('OKX', 'OrderBook fetch failed', { symbol, error: (e as Error).message });
      return this.getMockOrderBook(symbol, limit);
    }
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    const ccxtSymbol = this.toCcxtSymbol(symbol);
    try {
      const ticker = await this.exchange.fetchTicker(ccxtSymbol);
      const last = ticker?.last ?? ticker?.close;
      if (typeof last === 'number' && last > 0) return last;
    } catch {}
    try {
      const ob = await this.getOrderBookByExchange(symbol, 5);
      const bestBid = ob.bids?.[0]?.[0];
      const bestAsk = ob.asks?.[0]?.[0];
      if (bestBid != null && bestAsk != null && bestBid > 0 && bestAsk > 0) {
        return (bestBid + bestAsk) / 2;
      }
    } catch {}
    return this.getSymbolBasePrice(symbol);
  }

  async getTrades(symbol: string, limit = 100, _exchangeId?: string): Promise<{ price: number; amount: number; time: number; isBuy: boolean; quoteQuantity?: number }[]> {
    const ccxtSymbol = this.toCcxtSymbol(symbol);
    const okxLimit = Math.min(limit, config.limits.trades);
    try {
      const rows = await this.exchange.fetchTrades(ccxtSymbol, undefined, okxLimit);
      return rows.map((t: any) => {
        const price = Number(t.price ?? (t.cost && t.amount ? t.cost / t.amount : 0));
        const amount = Number(t.amount ?? (t.cost && t.price ? t.cost / t.price : 0));
        const cost = t.cost ?? (price * amount);
        return {
          price,
          amount,
          time: Number(t.timestamp ?? t.time ?? Date.now()),
          isBuy: t.side === 'buy' || t.buy === true,
          quoteQuantity: Number(cost)
        };
      }).sort((a, b) => a.time - b.time); // OKX: oldest first для CVD
    } catch (e) {
      logger.warn('OKX', 'Trades fetch failed', { symbol, error: (e as Error).message });
      return this.getMockTrades(symbol, limit);
    }
  }

  private getSymbolBasePrice(symbol: string): number {
    const s = symbol.toUpperCase();
    if (s.includes('BTC')) return 97000;
    if (s.includes('ETH')) return 3500;
    if (s.includes('SOL')) return 220;
    if (s.includes('BNB')) return 350;
    if (s.includes('DOGE')) return 0.4;
    return 1;
  }

  private getMockCandles(symbol: string, timeframe: string, limit: number): OHLCVCandle[] {
    const basePrice = this.getSymbolBasePrice(symbol);
    const tfMs = this.timeframeToMs(timeframe);
    const now = Date.now();
    const candles: OHLCVCandle[] = [];
    let price = basePrice;
    for (let i = limit; i >= 0; i--) {
      const change = (Math.random() - 0.48) * basePrice * 0.002;
      const open = price;
      price = price + change;
      candles.push({
        timestamp: now - i * tfMs,
        open,
        high: Math.max(open, price) * (1 + Math.random() * 0.001),
        low: Math.min(open, price) * (1 - Math.random() * 0.001),
        close: price,
        volume: (basePrice * 0.01 + Math.random() * basePrice * 0.02)
      });
    }
    return candles;
  }

  private getMockTrades(symbol: string, limit: number): { price: number; amount: number; time: number; isBuy: boolean; quoteQuantity?: number }[] {
    const base = this.getSymbolBasePrice(symbol);
    const trades: { price: number; amount: number; time: number; isBuy: boolean; quoteQuantity?: number }[] = [];
    let t = Date.now();
    for (let i = 0; i < limit; i++) {
      const price = base * (1 + (Math.random() - 0.5) * 0.001);
      const amount = Math.random() * 0.1 + 0.001;
      trades.push({
        price,
        amount,
        time: t - i * 2000,
        isBuy: Math.random() > 0.5,
        quoteQuantity: price * amount
      });
    }
    return trades;
  }

  private getMockOrderBook(symbol: string, limit: number): { bids: [number, number][]; asks: [number, number][] } {
    const base = this.getSymbolBasePrice(symbol);
    const spread = base * 0.0001;
    const bids: [number, number][] = [];
    const asks: [number, number][] = [];
    for (let i = 0; i < limit; i++) {
      bids.push([base - spread * (i + 1), Math.random() * 0.5 + 0.01]);
      asks.push([base + spread * (i + 1), Math.random() * 0.5 + 0.01]);
    }
    return { bids, asks };
  }

  private timeframeToMs(tf: string): number {
    const m: Record<string, number> = {
      '1m': 60000, '5m': 300000, '15m': 900000,
      '1h': 3600000, '4h': 14400000, '1d': 86400000
    };
    return m[tf] ?? 900000;
  }
}
