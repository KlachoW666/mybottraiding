/**
 * Формат торгового сигнала (раздел 6 ТЗ)
 */
/** Конфиг трейлинг-стопа (MaksBaks 11.3) */
export interface TrailingStopConfigSignal {
  initial_stop: number;       // начальный стоп (цена)
  trail_step_pct: number;     // 0.003 = 0.3%
  activation_profit_pct: number; // 0.01 = 1%
}

export interface TradingSignal {
  id: string;
  timestamp: string;
  symbol: string;
  exchange: string;
  direction: 'LONG' | 'SHORT';
  entry_price: number;
  stop_loss: number;
  take_profit: number[];
  risk_reward: number;
  confidence: number;
  timeframe: string;
  triggers: string[];
  expires_at: string;
  /** Трейлинг-стоп: активация после TP1 или +1% прибыли */
  trailing_stop_config?: TrailingStopConfigSignal;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.70) return 'medium';
  return 'low';
}
