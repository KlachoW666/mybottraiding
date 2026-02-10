/**
 * Risk Controller — концепции из crypto-trading-open-main (global_risk_controller.py)
 * и freqtrade-develop (strategy interface)
 *
 * - Макс. позиции на символ / всего
 * - Дневной лимит сделок
 * - Лимит времени в позиции
 * - Проверка баланса (информативно)
 */

export interface RiskConfig {
  maxPositionsTotal: number;
  maxPositionsPerSymbol: number;
  maxDailyTrades: number;
  maxPositionDurationHours: number;
  minBalanceWarning?: number;
  minBalanceCritical?: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxPositionsTotal: 5,
  maxPositionsPerSymbol: 1,
  maxDailyTrades: 50,
  maxPositionDurationHours: 24,
  minBalanceWarning: 100,
  minBalanceCritical: 50
};

export class RiskController {
  private config: RiskConfig;
  private dailyTradeCount: Record<string, number> = {};
  private lastTradeDate: string | null = null;

  constructor(config?: Partial<RiskConfig>) {
    this.config = { ...DEFAULT_RISK_CONFIG, ...config };
  }

  /** Проверка лимита позиций */
  checkPositionLimits(
    currentPositions: number,
    currentForSymbol: number,
    symbol: string
  ): { ok: boolean; reason?: string } {
    if (currentPositions >= this.config.maxPositionsTotal) {
      return { ok: false, reason: `max_positions_total: ${currentPositions} >= ${this.config.maxPositionsTotal}` };
    }
    if (currentForSymbol >= this.config.maxPositionsPerSymbol) {
      return { ok: false, reason: `max_positions_per_symbol (${symbol}): ${currentForSymbol} >= ${this.config.maxPositionsPerSymbol}` };
    }
    return { ok: true };
  }

  /** Проверка дневного лимита сделок (crypto-trading-open) */
  checkDailyTradeLimit(): { ok: boolean; reason?: string; count?: number } {
    const today = new Date().toISOString().slice(0, 10);
    if (this.lastTradeDate !== today) {
      this.dailyTradeCount = {};
      this.lastTradeDate = today;
    }
    const count = this.dailyTradeCount[today] ?? 0;
    if (count >= this.config.maxDailyTrades) {
      return { ok: false, reason: `max_daily_trades: ${count} >= ${this.config.maxDailyTrades}`, count };
    }
    return { ok: true, count };
  }

  /** Записать сделку */
  recordTrade(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.dailyTradeCount[today] = (this.dailyTradeCount[today] ?? 0) + 1;
    this.lastTradeDate = today;
  }

  /** Проверка времени в позиции (crypto-trading-open position_duration) */
  checkPositionDuration(openTime: Date): { ok: boolean; hours?: number; reason?: string } {
    const maxHours = this.config.maxPositionDurationHours;
    if (maxHours <= 0) return { ok: true };
    const now = new Date();
    const hours = (now.getTime() - openTime.getTime()) / (1000 * 3600);
    if (hours > maxHours) {
      return { ok: false, hours, reason: `position_duration: ${hours.toFixed(1)}h > ${maxHours}h` };
    }
    return { ok: true, hours };
  }

  /** Проверка баланса (информативно — crypto-trading-open) */
  checkBalance(balance: number): { level: 'ok' | 'warning' | 'critical'; reason?: string } {
    const critical = this.config.minBalanceCritical;
    const warning = this.config.minBalanceWarning;
    if (critical != null && balance < critical) {
      return { level: 'critical', reason: `balance ${balance} < ${critical}` };
    }
    if (warning != null && balance < warning) {
      return { level: 'warning', reason: `balance ${balance} < ${warning}` };
    }
    return { level: 'ok' };
  }

  /** Обновить конфиг */
  updateConfig(config: Partial<RiskConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): RiskConfig {
    return { ...this.config };
  }
}
