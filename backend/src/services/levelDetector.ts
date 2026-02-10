/**
 * Level Detector - автоматическое определение уровней Support/Resistance
 * Основан на уроках 11.1-11.5: "Пробой уровня"
 *
 * Методы определения уровней:
 * 1. Swing High/Low (локальные экстремумы)
 * 2. Volume Profile (кластеры объёма)
 * 3. Historical touches (многократные касания)
 */

import { OHLCVCandle } from '../types/candle';

export interface PriceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number;      // 1-10 (сила уровня)
  touches: number;       // количество касаний
  volume: number;        // объём на уровне
  lastTouch: number;     // timestamp последнего касания
  createdAt: number;     // timestamp создания уровня
}

/**
 * Detector для автоматического определения S/R уровней
 * MaksBaks Урок 11: пробой происходит на сильных уровнях с подтверждением
 */
export class LevelDetector {
  /**
   * Определить уровни на основе свечей
   */
  detectLevels(candles: OHLCVCandle[], sensitivity: 'low' | 'medium' | 'high' = 'medium'): PriceLevel[] {
    if (candles.length < 20) return [];

    const swingLevels = this.findSwingLevels(candles, sensitivity);
    const volumeLevels = this.findVolumeLevels(candles);

    // Объединение и фильтрация близких уровней
    const allLevels = [...swingLevels, ...volumeLevels];
    const merged = this.mergeLevels(allLevels, this.getTolerancePct(candles));

    // Сортировка по силе
    return merged.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Найти ближайший уровень к цене
   */
  findNearestLevel(price: number, levels: PriceLevel[], maxDistance: number = 0.03): PriceLevel | null {
    if (!levels.length) return null;

    let nearest: PriceLevel | null = null;
    let minDist = Infinity;

    for (const level of levels) {
      const dist = Math.abs((price - level.price) / price);
      if (dist < minDist && dist <= maxDistance) {
        minDist = dist;
        nearest = level;
      }
    }

    return nearest;
  }

  /**
   * Проверить, приближается ли цена к уровню
   */
  isApproachingLevel(
    price: number,
    level: PriceLevel,
    threshold: number = 0.01 // 1% от цены
  ): boolean {
    const distance = Math.abs((price - level.price) / price);
    return distance <= threshold;
  }

  /**
   * Проверить, пробит ли уровень
   */
  isLevelBroken(
    currentPrice: number,
    previousPrice: number,
    level: PriceLevel,
    confirmationPct: number = 0.002 // 0.2% подтверждение
  ): boolean {
    const levelPrice = level.price;

    if (level.type === 'resistance') {
      // Пробой сопротивления вверх: prev < level < current
      const crossed = previousPrice < levelPrice && currentPrice > levelPrice;
      const confirmed = currentPrice > levelPrice * (1 + confirmationPct);
      return crossed && confirmed;
    } else {
      // Пробой поддержки вниз: prev > level > current
      const crossed = previousPrice > levelPrice && currentPrice < levelPrice;
      const confirmed = currentPrice < levelPrice * (1 - confirmationPct);
      return crossed && confirmed;
    }
  }

  /**
   * Найти уровни по Swing High/Low
   */
  private findSwingLevels(candles: OHLCVCandle[], sensitivity: 'low' | 'medium' | 'high'): PriceLevel[] {
    const lookback = sensitivity === 'high' ? 3 : sensitivity === 'medium' ? 5 : 7;
    const levels: PriceLevel[] = [];

    for (let i = lookback; i < candles.length - lookback; i++) {
      const curr = candles[i];

      // Проверка Swing High (локальный максимум)
      const isSwingHigh = this.isLocalHigh(candles, i, lookback);
      if (isSwingHigh) {
        const touches = this.countTouches(candles, curr.high, 'resistance', i);
        const volume = this.getVolumeAtLevel(candles, curr.high, i);
        levels.push({
          price: curr.high,
          type: 'resistance',
          strength: this.calculateStrength(touches, volume),
          touches,
          volume,
          lastTouch: curr.timestamp,
          createdAt: curr.timestamp
        });
      }

      // Проверка Swing Low (локальный минимум)
      const isSwingLow = this.isLocalLow(candles, i, lookback);
      if (isSwingLow) {
        const touches = this.countTouches(candles, curr.low, 'support', i);
        const volume = this.getVolumeAtLevel(candles, curr.low, i);
        levels.push({
          price: curr.low,
          type: 'support',
          strength: this.calculateStrength(touches, volume),
          touches,
          volume,
          lastTouch: curr.timestamp,
          createdAt: curr.timestamp
        });
      }
    }

    return levels;
  }

  /**
   * Найти уровни по объёму (Volume Profile)
   */
  private findVolumeLevels(candles: OHLCVCandle[]): PriceLevel[] {
    if (candles.length < 50) return [];

    // Построить простой Volume Profile
    const priceStep = this.getOptimalPriceStep(candles);
    const volumeByPrice = new Map<number, number>();

    for (const c of candles) {
      const avgPrice = (c.high + c.low + c.close) / 3;
      const bucket = Math.round(avgPrice / priceStep) * priceStep;
      volumeByPrice.set(bucket, (volumeByPrice.get(bucket) || 0) + (c.volume ?? 0));
    }

    // Найти POC и HVN
    const sorted = Array.from(volumeByPrice.entries()).sort((a, b) => b[1] - a[1]);
    const topVolumes = sorted.slice(0, 5); // топ-5 объёмных зон

    const levels: PriceLevel[] = [];
    const currentPrice = candles[candles.length - 1].close;

    for (const [price, volume] of topVolumes) {
      const type: 'support' | 'resistance' = price < currentPrice ? 'support' : 'resistance';
      const touches = 1; // Volume level считается как 1 касание
      levels.push({
        price,
        type,
        strength: Math.min(10, Math.round((volume / 1000) * 2)), // volume-based strength
        touches,
        volume,
        lastTouch: candles[candles.length - 1].timestamp,
        createdAt: candles[0].timestamp
      });
    }

    return levels;
  }

  /**
   * Проверка локального максимума
   */
  private isLocalHigh(candles: OHLCVCandle[], index: number, lookback: number): boolean {
    const curr = candles[index];
    for (let i = index - lookback; i < index + lookback; i++) {
      if (i === index || i < 0 || i >= candles.length) continue;
      if (candles[i].high >= curr.high) return false;
    }
    return true;
  }

  /**
   * Проверка локального минимума
   */
  private isLocalLow(candles: OHLCVCandle[], index: number, lookback: number): boolean {
    const curr = candles[index];
    for (let i = index - lookback; i < index + lookback; i++) {
      if (i === index || i < 0 || i >= candles.length) continue;
      if (candles[i].low <= curr.low) return false;
    }
    return true;
  }

  /**
   * Подсчёт касаний уровня
   */
  private countTouches(candles: OHLCVCandle[], level: number, type: 'support' | 'resistance', startIndex: number): number {
    const tolerance = this.getTolerancePct(candles);
    let touches = 1;

    for (let i = startIndex + 1; i < candles.length; i++) {
      const c = candles[i];
      const checkPrice = type === 'resistance' ? c.high : c.low;
      const distance = Math.abs((checkPrice - level) / level);
      if (distance <= tolerance) touches++;
    }

    return touches;
  }

  /**
   * Получить объём на уровне
   */
  private getVolumeAtLevel(candles: OHLCVCandle[], level: number, startIndex: number): number {
    const tolerance = this.getTolerancePct(candles);
    let volume = 0;

    for (let i = startIndex; i < candles.length; i++) {
      const c = candles[i];
      const inRange = Math.abs((c.close - level) / level) <= tolerance;
      if (inRange) volume += c.volume ?? 0;
    }

    return volume;
  }

  /**
   * Рассчитать силу уровня
   */
  private calculateStrength(touches: number, volume: number): number {
    let strength = 0;

    // Вес по касаниям: каждое касание +2, макс 6
    strength += Math.min(6, touches * 2);

    // Вес по объёму: нормализация, макс 4
    const volScore = Math.min(4, Math.round(volume / 10000));
    strength += volScore;

    return Math.min(10, strength);
  }

  /**
   * Объединить близкие уровни
   */
  private mergeLevels(levels: PriceLevel[], tolerance: number): PriceLevel[] {
    if (levels.length === 0) return [];

    const sorted = levels.sort((a, b) => a.price - b.price);
    const merged: PriceLevel[] = [];

    let current = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      const distance = Math.abs((next.price - current.price) / current.price);

      if (distance <= tolerance) {
        // Объединить: взвешенное среднее по силе
        const totalStrength = current.strength + next.strength;
        current = {
          price: (current.price * current.strength + next.price * next.strength) / totalStrength,
          type: current.strength >= next.strength ? current.type : next.type,
          strength: Math.min(10, current.strength + next.strength / 2),
          touches: current.touches + next.touches,
          volume: current.volume + next.volume,
          lastTouch: Math.max(current.lastTouch, next.lastTouch),
          createdAt: Math.min(current.createdAt, next.createdAt)
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);

    return merged;
  }

  /**
   * Вычислить оптимальный tolerance для уровней
   */
  private getTolerancePct(candles: OHLCVCandle[]): number {
    if (candles.length === 0) return 0.005; // 0.5% default
    const avgPrice = candles.reduce((s, c) => s + c.close, 0) / candles.length;
    const avgRange = candles.reduce((s, c) => s + (c.high - c.low), 0) / candles.length;
    const rangePct = avgRange / avgPrice;
    // Tolerance = 30% от среднего диапазона свечи
    return Math.max(0.003, Math.min(0.01, rangePct * 0.3));
  }

  /**
   * Вычислить оптимальный price step для Volume Profile
   */
  private getOptimalPriceStep(candles: OHLCVCandle[]): number {
    if (candles.length === 0) return 1;
    const avgPrice = candles.reduce((s, c) => s + c.close, 0) / candles.length;
    const avgRange = candles.reduce((s, c) => s + (c.high - c.low), 0) / candles.length;
    // Step = 10% от среднего диапазона свечи
    return Math.max(0.01, avgRange * 0.1);
  }
}
