/**
 * Исход сделки для онлайн обучения
 */
export interface TradeOutcomeFeatures {
  confidence: number;      // 0–1
  direction: number;       // LONG=1, SHORT=0
  riskReward: number;      // R:R
  triggersCount: number;
  rsiBucket?: number;      // oversold=1, neutral=0, overbought=-1
  volumeConfirm?: number;  // 0/1
  symbolBucket?: number;   // BTC=1, ETH=0.8, alt=0.5
}

export interface TradeOutcome {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  riskReward: number;
  triggers: string[];
  pnl: number;
  pnlPercent: number;
  openPrice: number;
  closePrice: number;
  leverage: number;
  openTime: string;
  closeTime: string;
  features: TradeOutcomeFeatures;
}
