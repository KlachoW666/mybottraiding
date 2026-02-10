/**
 * Нормализованный формат свечи
 */
export interface OHLCVCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Паттерны свечей (раздел 5.1 ТЗ + Razrabotka/img)
 * shooting_star, hanging_man, inverted_hammer - по Cheat Sheet
 * dragonfly_doji, gravestone_doji - Doji-варианты
 * tweezer_tops, tweezer_bottoms - поддержка/сопротивление
 * bullish_harami, bearish_harami - инсайд-бары
 * three_black_crows - медвежья контра
 */
export type CandlePattern =
  | 'bullish_engulfing'
  | 'bearish_engulfing'
  | 'hammer'
  | 'inverted_hammer'
  | 'hanging_man'
  | 'shooting_star'
  | 'doji'
  | 'dragonfly_doji'
  | 'gravestone_doji'
  | 'tweezer_tops'
  | 'tweezer_bottoms'
  | 'bullish_harami'
  | 'bearish_harami'
  | 'piercing_line'
  | 'dark_cloud_cover'
  | 'morning_star'
  | 'evening_star'
  | 'three_white_soldiers'
  | 'three_black_crows'
  | 'spinning_top'
  | 'bull_marubozu'
  | 'bear_marubozu'
  | 'binhv45_lower_bb_reversal'
  | 'cluc_low_volume_dip'
  | 'hlhb_ema_rsi_cross'
  | 'hlhb_ema_rsi_cross_bear'
  | 'volatility_breakout'
  | 'volatility_breakout_bear'
  | 'adx_trend'
  | 'emarsi_oversold'
  | 'supertrend_up'
  | 'supertrend_down'
  | 'none';
