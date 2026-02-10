/**
 * Funding Rate Monitor — ставка финансирования (MaksBaks Урок 5)
 * High positive = много лонгов → осторожно с long.
 * High negative = много шортов → осторожно с short.
 */

import ccxt, { Exchange } from 'ccxt';
import { config } from '../config';
import { toOkxCcxtSymbol } from '../lib/symbol';
import { normalizeSymbol } from '../lib/symbol';
import { logger } from '../lib/logger';

export interface FundingRateResult {
  symbol: string;
  rate: number;           // e.g. 0.0001 = 0.01%
  nextFundingTime?: number;
  interpretation: 'bullish' | 'bearish' | 'neutral';
  shouldAvoidLong: boolean;
  shouldAvoidShort: boolean;
}

const FUNDING_HIGH_POSITIVE = 0.0005;   // 0.05% — осторожно с long
const FUNDING_HIGH_NEGATIVE = -0.0005;  // -0.05% — осторожно с short

export class FundingRateMonitor {
  private exchange: Exchange;

  constructor() {
    const opts: Record<string, unknown> = {
      enableRateLimit: true,
      options: { defaultType: 'swap' },
      timeout: 15000
    };
    if (config.okx.hasCredentials) {
      opts.apiKey = config.okx.apiKey;
      opts.secret = config.okx.secret;
      opts.password = config.okx.passphrase;
    }
    if (config.proxy) (opts as any).httpsProxy = config.proxy;
    this.exchange = new ccxt.okx(opts);
  }

  async getFundingRate(symbol: string): Promise<FundingRateResult | null> {
    const sym = normalizeSymbol(symbol);
    const ccxtSymbol = toOkxCcxtSymbol(sym) || 'BTC/USDT:USDT';
    try {
      const data = await this.exchange.fetchFundingRate(ccxtSymbol);
      const rate = Number(data.fundingRate ?? data.nextFundingRate ?? 0);
      const nextTime = data.fundingTimestamp ?? data.nextFundingTimestamp;
      const interpretation = this.interpretRate(rate);
      return {
        symbol: sym || symbol,
        rate,
        nextFundingTime: nextTime != null ? Number(nextTime) : undefined,
        interpretation,
        shouldAvoidLong: rate >= FUNDING_HIGH_POSITIVE,
        shouldAvoidShort: rate <= FUNDING_HIGH_NEGATIVE
      };
    } catch (e) {
      logger.warn('FundingRateMonitor', 'fetch failed', { symbol: sym, error: (e as Error).message });
      return null;
    }
  }

  interpretRate(rate: number): 'bullish' | 'bearish' | 'neutral' {
    if (rate >= FUNDING_HIGH_POSITIVE) return 'bearish';  // много лонгов = контриндикатор для long
    if (rate <= FUNDING_HIGH_NEGATIVE) return 'bullish'; // много шортов = контриндикатор для short
    return 'neutral';
  }

  shouldAvoidLong(rate: number): boolean {
    return rate >= FUNDING_HIGH_POSITIVE;
  }

  shouldAvoidShort(rate: number): boolean {
    return rate <= FUNDING_HIGH_NEGATIVE;
  }
}
