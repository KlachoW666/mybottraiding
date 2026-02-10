/**
 * Breakout Detector - детекция пробоя уровня с подтверждением
 * Основан на уроках 11.1-11.5 MaksBaks: "Как торговать пробой уровня"
 *
 * Ключевые концепции:
 * 1. Пробой = Price breaks level + Volume confirmation
 * 2. Правильная точка входа = после подтверждения, не на ложном пробое
 * 3. Ложный пробой = пробой без объёма или быстрый возврат
 * 4. Подтверждение = Стакан + Лента + Свечи согласны
 */

import { OHLCVCandle } from '../types/candle';
import { PriceLevel } from './levelDetector';
import { OrderBookInput, TradeInput, detectBreakoutPressure } from './marketAnalysis';
import { VOLUME_BREAKOUT_MULTIPLIER, FALSE_BREAKOUT_VOLUME_MIN } from '../lib/tradingPrinciples';

export interface BreakoutSignal {
  level: PriceLevel;
  direction: 'LONG' | 'SHORT';
  confidence: number;           // 0-1
  volumeConfirmation: boolean;
  falseBreakoutRisk: number;    // 0-1 (вероятность ложного пробоя)
  entryZone: {
    optimal: number;            // оптимальная точка входа
    min: number;                // минимальная цена зоны
    max: number;                // максимальная цена зоны
  };
  invalidationPrice: number;    // цена, при которой пробой отменяется
  reasons: string[];
  metrics: {
    volumeRatio: number;        // текущий объём / средний
    priceDistance: number;      // расстояние от уровня (%)
    tapeDelta: number;          // дельта ленты
    orderBookPressure: number;  // давление в стакане
  };
}

/**
 * Detector для пробоя уровня
 * MaksBaks: пробой уровня - основная стратегия скальпинга
 */
export class BreakoutDetector {
  /**
   * Детекция пробоя уровня с подтверждением.
   * fundingHint: при LONG и shouldAvoidLong / при SHORT и shouldAvoidShort — снижаем confidence (Phase 2).
   */
  detectBreakout(
    currentPrice: number,
    level: PriceLevel,
    orderBook: OrderBookInput,
    tape: TradeInput[],
    candles: OHLCVCandle[],
    fundingHint?: { shouldAvoidLong: boolean; shouldAvoidShort: boolean }
  ): BreakoutSignal | null {
    if (candles.length < 3) return null;

    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];

    // Проверка: цена действительно пробила уровень?
    const direction = this.detectBreakDirection(currentPrice, prevCandle.close, level);
    if (!direction) return null;

    // === 1. Volume Confirmation (Schwager: объём при пробое > 1.2× среднего) ===
    const avgVolume = this.calculateAvgVolume(candles.slice(-20));
    const currentVolume = lastCandle.volume ?? 0;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;
    const volumeConfirmation = volumeRatio >= VOLUME_BREAKOUT_MULTIPLIER;

    // === 2. False Breakout Risk (Nison: пробой без объёма = подозрительно) ===
    const falseBreakoutRisk = this.calculateFalseBreakoutRisk(
      volumeRatio,
      lastCandle,
      level,
      direction
    );

    // === 3. Order Book Pressure (detectBreakoutPressure из marketAnalysis) ===
    const obPressure = detectBreakoutPressure(orderBook, level.price, direction === 'LONG' ? 'up' : 'down');
    const orderBookPressure = obPressure.pressure;

    // === 4. Tape Delta ===
    const tapeDelta = this.analyzeTapeDelta(tape);

    // === 5. Confluence Check ===
    const reasons: string[] = [];
    let confidence = 0.5; // базовая уверенность

    // Volume confirmation
    if (volumeConfirmation) {
      confidence += 0.15;
      reasons.push(`Volume ${volumeRatio.toFixed(1)}× average`);
    } else if (volumeRatio > 1.0) {
      confidence += 0.05;
    } else {
      confidence -= 0.1;
      reasons.push('Low volume - caution');
    }

    // Order book pressure (detectBreakoutPressure)
    if (orderBookPressure > 1.5) {
      confidence += 0.15;
      reasons.push(`Strong ${direction === 'LONG' ? 'buy' : 'sell'} pressure in book`);
    } else if (orderBookPressure > 1.2) {
      confidence += 0.08;
    }
    if (obPressure.confidence > 0.6) reasons.push(`Breakout pressure ${(obPressure.confidence * 100).toFixed(0)}%`);
    if (obPressure.confidence >= 0.8) confidence += 0.05;

    // Tape delta
    const tapeAligned = (direction === 'LONG' && tapeDelta > 0.15) || (direction === 'SHORT' && tapeDelta < -0.15);
    if (tapeAligned) {
      confidence += 0.12;
      reasons.push(`Tape delta ${(tapeDelta * 100).toFixed(0)}% confirms`);
    }

    // Level strength
    if (level.strength >= 7) {
      confidence += 0.1;
      reasons.push(`Strong level (${level.strength}/10)`);
    } else if (level.strength >= 5) {
      confidence += 0.05;
    }

    // False breakout penalty
    if (falseBreakoutRisk > 0.5) {
      confidence -= 0.15;
      reasons.push(`High false breakout risk (${(falseBreakoutRisk * 100).toFixed(0)}%)`);
    } else if (falseBreakoutRisk > 0.3) {
      confidence -= 0.08;
    }

    // Candlestick confirmation (закрытие за уровнем)
    const candleClosedBeyond = direction === 'LONG'
      ? lastCandle.close > level.price
      : lastCandle.close < level.price;
    if (candleClosedBeyond) {
      confidence += 0.08;
      reasons.push('Candle closed beyond level');
    }

    // Funding rate (MaksBaks Урок 5): контриндикатор — снижаем confidence при неблагоприятном funding
    if (fundingHint) {
      if (direction === 'LONG' && fundingHint.shouldAvoidLong) {
        confidence -= 0.12;
        reasons.push('Funding rate unfavorable for long');
      } else if (direction === 'SHORT' && fundingHint.shouldAvoidShort) {
        confidence -= 0.12;
        reasons.push('Funding rate unfavorable for short');
      }
    }

    confidence = Math.max(0, Math.min(1, confidence));

    // Минимальная уверенность для сигнала
    if (confidence < 0.55) return null;

    // === 6. Entry Zone (MaksBaks: правильная точка входа) ===
    const entryZone = this.calculateEntryZone(currentPrice, level.price, direction);

    // === 7. Invalidation Price (стоп-лосс зона) ===
    const invalidationPrice = this.calculateInvalidationPrice(level.price, direction);

    // === 8. Distance from level ===
    const priceDistance = Math.abs((currentPrice - level.price) / level.price);

    return {
      level,
      direction,
      confidence,
      volumeConfirmation,
      falseBreakoutRisk,
      entryZone,
      invalidationPrice,
      reasons,
      metrics: {
        volumeRatio,
        priceDistance,
        tapeDelta,
        orderBookPressure
      }
    };
  }

  /**
   * Определить направление пробоя
   */
  private detectBreakDirection(
    currentPrice: number,
    previousPrice: number,
    level: PriceLevel
  ): 'LONG' | 'SHORT' | null {
    const levelPrice = level.price;
    const confirmationPct = 0.0015; // 0.15% подтверждение

    // Пробой сопротивления вверх
    if (level.type === 'resistance') {
      const crossed = previousPrice < levelPrice && currentPrice > levelPrice;
      const confirmed = currentPrice > levelPrice * (1 + confirmationPct);
      return crossed && confirmed ? 'LONG' : null;
    }

    // Пробой поддержки вниз
    if (level.type === 'support') {
      const crossed = previousPrice > levelPrice && currentPrice < levelPrice;
      const confirmed = currentPrice < levelPrice * (1 - confirmationPct);
      return crossed && confirmed ? 'SHORT' : null;
    }

    return null;
  }

  /**
   * Рассчитать риск ложного пробоя
   * MaksBaks: ложный пробой = пробой без объёма или быстрый возврат
   */
  private calculateFalseBreakoutRisk(
    volumeRatio: number,
    lastCandle: OHLCVCandle,
    level: PriceLevel,
    direction: 'LONG' | 'SHORT'
  ): number {
    let risk = 0;

    // 1. Низкий объём = высокий риск
    if (volumeRatio < FALSE_BREAKOUT_VOLUME_MIN) {
      risk += 0.4;
    } else if (volumeRatio < VOLUME_BREAKOUT_MULTIPLIER) {
      risk += 0.2;
    }

    // 2. Слабое тело свечи (большие тени) = нерешительность
    const body = Math.abs(lastCandle.close - lastCandle.open);
    const range = lastCandle.high - lastCandle.low;
    const bodyRatio = range > 0 ? body / range : 0;
    if (bodyRatio < 0.4) {
      risk += 0.2;
    }

    // 3. Закрытие свечи вернулось к уровню = weak breakout
    const closedBeyond = direction === 'LONG'
      ? lastCandle.close > level.price * 1.002
      : lastCandle.close < level.price * 0.998;
    if (!closedBeyond) {
      risk += 0.3;
    }

    return Math.min(1, risk);
  }

  /**
   * Анализ давления в стакане
   * MaksBaks: стакан должен подтверждать пробой
   */
  private analyzeOrderBookPressure(
    orderBook: OrderBookInput,
    levelPrice: number,
    direction: 'LONG' | 'SHORT'
  ): number {
    const bids = orderBook.bids || [];
    const asks = orderBook.asks || [];
    if (!bids.length || !asks.length) return 1;

    const bidVolume = bids.slice(0, 10).reduce((s, [, a]) => s + a, 0);
    const askVolume = asks.slice(0, 10).reduce((s, [, a]) => s + a, 0);

    if (direction === 'LONG') {
      // Для long: bid volume должен превышать ask volume
      return askVolume > 0 ? bidVolume / askVolume : 1;
    } else {
      // Для short: ask volume должен превышать bid volume
      return bidVolume > 0 ? askVolume / bidVolume : 1;
    }
  }

  /**
   * Анализ дельты ленты
   */
  private analyzeTapeDelta(trades: TradeInput[]): number {
    if (!trades.length) return 0;

    let buyVolume = 0;
    let sellVolume = 0;

    for (const t of trades) {
      const vol = t.quoteQuantity ?? t.price * t.amount;
      if (t.isBuy) buyVolume += vol;
      else sellVolume += vol;
    }

    const total = buyVolume + sellVolume;
    return total > 0 ? (buyVolume - sellVolume) / total : 0;
  }

  /**
   * Рассчитать зону входа
   * MaksBaks 11.1: правильная точка входа - после подтверждения пробоя
   */
  private calculateEntryZone(
    currentPrice: number,
    levelPrice: number,
    direction: 'LONG' | 'SHORT'
  ): { optimal: number; min: number; max: number } {
    if (direction === 'LONG') {
      // После пробоя вверх: вход на retest или немного выше уровня
      const optimal = levelPrice * 1.003; // +0.3% выше уровня
      const min = levelPrice * 1.001;
      const max = levelPrice * 1.008; // до +0.8%
      return { optimal, min, max };
    } else {
      // После пробоя вниз: вход на retest или немного ниже уровня
      const optimal = levelPrice * 0.997; // -0.3% ниже уровня
      const min = levelPrice * 0.992; // до -0.8%
      const max = levelPrice * 0.999;
      return { optimal, min, max };
    }
  }

  /**
   * Рассчитать цену инвалидации (стоп-лосс)
   * MaksBaks 11.3: стоп за уровнем, если вернулось назад = ложный пробой
   */
  private calculateInvalidationPrice(levelPrice: number, direction: 'LONG' | 'SHORT'): number {
    if (direction === 'LONG') {
      // Для long: стоп ниже уровня
      return levelPrice * 0.995; // -0.5%
    } else {
      // Для short: стоп выше уровня
      return levelPrice * 1.005; // +0.5%
    }
  }

  /**
   * Средний объём
   */
  private calculateAvgVolume(candles: OHLCVCandle[]): number {
    if (!candles.length) return 0;
    const sum = candles.reduce((s, c) => s + (c.volume ?? 0), 0);
    return sum / candles.length;
  }

  /**
   * Проверить, является ли пробой ложным (после факта)
   * MaksBaks: если цена быстро вернулась = ложный пробой
   */
  isFalseBreakout(breakout: BreakoutSignal, currentPrice: number): boolean {
    const { level, direction } = breakout;

    if (direction === 'LONG') {
      // Если цена вернулась ниже уровня = ложный пробой
      return currentPrice < level.price;
    } else {
      // Если цена вернулась выше уровня = ложный пробой
      return currentPrice > level.price;
    }
  }
}
