/**
 * Онлайн машинное обучение на основе исходов сделок.
 * SGD Logistic Regression — обновление модели после каждой закрытой сделки.
 */

import { logger } from '../lib/logger';

const FEATURE_DIM = 6;
const LEARNING_RATE = 0.1;
const L2_REG = 0.01;

/** Веса модели (инициализация нулями) */
let weights: number[] = new Array(FEATURE_DIM).fill(0);
let sampleCount = 0;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, x))));
}

/** Нормализация признаков в [0,1] или [-1,1] */
function extractFeatures(f: {
  confidence: number;
  direction: number;
  riskReward: number;
  triggersCount: number;
  rsiBucket?: number;
  volumeConfirm?: number;
}): number[] {
  return [
    f.confidence,
    f.direction,
    Math.min(1, f.riskReward / 4),
    Math.min(1, f.triggersCount / 5),
    (f.rsiBucket ?? 0) / 2 + 0.5,
    f.volumeConfirm ?? 0.5
  ];
}

/**
 * Предсказание вероятности выигрыша (0–1)
 */
export function predict(features: {
  confidence: number;
  direction: number;
  riskReward: number;
  triggersCount: number;
  rsiBucket?: number;
  volumeConfirm?: number;
}): number {
  const x = extractFeatures(features);
  let z = 0;
  for (let i = 0; i < FEATURE_DIM; i++) {
    z += weights[i] * x[i];
  }
  return sigmoid(z);
}

/**
 * Онлайн обновление модели (SGD) после исхода сделки
 */
export function update(
  features: {
    confidence: number;
    direction: number;
    riskReward: number;
    triggersCount: number;
    rsiBucket?: number;
    volumeConfirm?: number;
  },
  win: boolean
): void {
  const x = extractFeatures(features);
  const y = win ? 1 : 0;
  const pred = predict(features);
  const error = y - pred;

  for (let i = 0; i < FEATURE_DIM; i++) {
    const grad = -error * x[i] + L2_REG * weights[i];
    weights[i] -= LEARNING_RATE * grad;
  }
  sampleCount++;
  if (sampleCount % 10 === 0) {
    logger.info('onlineML', `samples=${sampleCount} weights=${weights.map((w) => w.toFixed(3)).join(',')}`);
  }
}

/**
 * Корректировка confidence на основе ML предсказания
 */
export function adjustConfidence(
  baseConfidence: number,
  features: {
    confidence: number;
    direction: number;
    riskReward: number;
    triggersCount: number;
    rsiBucket?: number;
    volumeConfirm?: number;
  }
): number {
  if (sampleCount < 5) return baseConfidence;
  const mlProb = predict(features);
  const blend = Math.min(0.5, sampleCount / 50) * 0.3;
  return baseConfidence * (1 - blend) + mlProb * blend;
}

export function getStats(): { samples: number; weights: number[] } {
  return { samples: sampleCount, weights: [...weights] };
}
