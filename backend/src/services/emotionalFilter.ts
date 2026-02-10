/**
 * Emotional Filter (MaksBaks Урок 12: FOMO, тильт, эмоции)
 * Cooldown после серии убытков, max drawdown per day, streak tracking.
 */

export interface TradingState {
  /** Серия убытков подряд */
  lossStreak: number;
  /** Серия прибылей подряд */
  winStreak: number;
  /** Cooldown до (timestamp ms) — не открывать новые сделки до этого времени */
  cooldownUntil: number;
  /** Начальный баланс дня (для расчёта drawdown) */
  dayStartBalance: number;
  /** Текущий баланс дня (или эквивалент PnL) */
  currentBalance: number;
  /** День (YYYY-MM-DD) для сброса dayStartBalance */
  dayKey: string;
  /** Автостоп из-за дневного drawdown (до конца дня) */
  dailyStopActive: boolean;
}

const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000; // 30 мин
const DEFAULT_MAX_LOSS_STREAK = 3;
const DEFAULT_MAX_DAILY_DRAWDOWN_PCT = 5;

export class EmotionalFilter {
  private state: TradingState = {
    lossStreak: 0,
    winStreak: 0,
    cooldownUntil: 0,
    dayStartBalance: 100,
    currentBalance: 100,
    dayKey: '',
    dailyStopActive: false
  };

  private cooldownMs = DEFAULT_COOLDOWN_MS;
  private maxLossStreak = DEFAULT_MAX_LOSS_STREAK;
  private maxDailyDrawdownPct = DEFAULT_MAX_DAILY_DRAWDOWN_PCT;

  constructor(options?: {
    cooldownMs?: number;
    maxLossStreak?: number;
    maxDailyDrawdownPct?: number;
  }) {
    if (options?.cooldownMs != null) this.cooldownMs = options.cooldownMs;
    if (options?.maxLossStreak != null) this.maxLossStreak = options.maxLossStreak;
    if (options?.maxDailyDrawdownPct != null) this.maxDailyDrawdownPct = options.maxDailyDrawdownPct;
    this.ensureDayKey();
  }

  private dayKeyNow(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private ensureDayKey(): void {
    const today = this.dayKeyNow();
    if (this.state.dayKey !== today) {
      this.state.dayKey = today;
      this.state.dayStartBalance = this.state.currentBalance;
      this.state.dailyStopActive = false;
    }
  }

  /** Текущее состояние (для API) */
  getState(): TradingState {
    this.ensureDayKey();
    return { ...this.state };
  }

  /** Можно ли открывать новую сделку */
  canOpenTrade(): { allowed: boolean; reason?: string } {
    this.ensureDayKey();
    const now = Date.now();
    if (this.state.dailyStopActive) {
      return { allowed: false, reason: 'Daily drawdown limit reached. Trading paused until next day.' };
    }
    if (now < this.state.cooldownUntil) {
      const left = Math.ceil((this.state.cooldownUntil - now) / 60000);
      return { allowed: false, reason: `Cooldown active. ${left} min left.` };
    }
    return { allowed: true };
  }

  /** Зарегистрировать результат сделки (pnl > 0 — прибыль, < 0 — убыток) */
  recordTradeOutcome(pnl: number): void {
    this.ensureDayKey();
    this.state.currentBalance += pnl;
    if (pnl >= 0) {
      this.state.winStreak += 1;
      this.state.lossStreak = 0;
    } else {
      this.state.lossStreak += 1;
      this.state.winStreak = 0;
      if (this.state.lossStreak >= this.maxLossStreak) {
        this.state.cooldownUntil = Date.now() + this.cooldownMs;
      }
    }
    const drawdownPct =
      (this.state.dayStartBalance > 0)
        ? ((this.state.dayStartBalance - this.state.currentBalance) / this.state.dayStartBalance) * 100
        : 0;
    if (drawdownPct >= this.maxDailyDrawdownPct) {
      this.state.dailyStopActive = true;
    }
  }

  /** Установить баланс (при старте дня или при подключении к бирже) */
  setBalance(balance: number): void {
    this.ensureDayKey();
    this.state.currentBalance = balance;
    if (this.state.dayKey !== this.dayKeyNow()) this.state.dayStartBalance = balance;
  }

  /** Сброс состояния (для тестов или ручного сброса) */
  reset(): void {
    this.state = {
      lossStreak: 0,
      winStreak: 0,
      cooldownUntil: 0,
      dayStartBalance: this.state.currentBalance,
      currentBalance: this.state.currentBalance,
      dayKey: this.dayKeyNow(),
      dailyStopActive: false
    };
  }
}

/** Общий экземпляр для API и AutoTrader (избегаем циклического импорта) */
export const emotionalFilterInstance = new EmotionalFilter();
