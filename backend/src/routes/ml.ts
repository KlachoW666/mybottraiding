/**
 * API для онлайн ML: запись исходов сделок, предсказание
 */

import { Router } from 'express';
import { update, predict, getStats } from '../services/onlineMLService';
import { logger } from '../lib/logger';

const router = Router();

/** POST /api/ml/trade-outcome — записать исход сделки, обновить модель */
router.post('/trade-outcome', (req, res) => {
  try {
    const body = req.body || {};
    const pnl = Number(body.pnl) ?? 0;
    const confidence = Number(body.confidence) ?? 0;
    const direction = (body.direction || 'LONG').toUpperCase() as 'LONG' | 'SHORT';
    const riskReward = Number(body.riskReward) ?? 1;
    const triggers = Array.isArray(body.triggers) ? body.triggers : [];
    const rsi = body.rsi != null ? Number(body.rsi) : undefined;
    const volumeConfirm = body.volumeConfirm === true ? 1 : body.volumeConfirm === false ? 0 : undefined;

    const features = {
      confidence,
      direction: direction === 'LONG' ? 1 : 0,
      riskReward,
      triggersCount: triggers.length,
      rsiBucket: rsi != null ? (rsi < 30 ? 1 : rsi > 70 ? -1 : 0) : undefined,
      volumeConfirm
    };

    const win = pnl > 0;
    update(features, win);

    logger.info('ml/trade-outcome', `symbol=${body.symbol} dir=${direction} pnl=${pnl.toFixed(2)} win=${win} samples=${getStats().samples}`);

    res.json({ ok: true, win, samples: getStats().samples });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/ml/predict — предсказать вероятность выигрыша */
router.post('/predict', (req, res) => {
  try {
    const body = req.body || {};
    const features = {
      confidence: Number(body.confidence) ?? 0.7,
      direction: (body.direction || 'LONG').toUpperCase() === 'LONG' ? 1 : 0,
      riskReward: Number(body.riskReward) ?? 2,
      triggersCount: Array.isArray(body.triggers) ? body.triggers.length : 0,
      rsiBucket: body.rsi != null ? (Number(body.rsi) < 30 ? 1 : Number(body.rsi) > 70 ? -1 : 0) : undefined,
      volumeConfirm: body.volumeConfirm === true ? 1 : body.volumeConfirm === false ? 0 : undefined
    };

    const prob = predict(features);
    res.json({ winProbability: Math.round(prob * 1000) / 1000, samples: getStats().samples });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/ml/stats — статистика модели */
router.get('/stats', (_req, res) => {
  res.json(getStats());
});

export default router;
