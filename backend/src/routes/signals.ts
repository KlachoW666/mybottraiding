import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { TradingSignal } from '../types/signal';
import { updateTrailingStop, DEFAULT_TRAILING_CONFIG } from '../lib/trailingStop';

const router = Router();
const MAX_SIGNALS = 200;

function getDataDir(): string {
  if (process.env.DATA_DIR) return path.join(process.env.DATA_DIR, 'data');
  try {
    if (typeof process !== 'undefined' && (process as NodeJS.Process & { versions?: { electron?: string } }).versions?.electron) {
      const { app } = require('electron');
      return path.join(app.getPath('userData'), 'data');
    }
  } catch {}
  return path.join(process.cwd(), 'data');
}

function getSignalsPath(): string {
  return path.join(getDataDir(), 'signals.json');
}

function loadSignals(): TradingSignal[] {
  try {
    const p = getSignalsPath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }
  } catch (e) {
    console.error('loadSignals error:', e);
  }
  return [];
}

function saveSignals(arr: TradingSignal[]): void {
  try {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getSignalsPath(), JSON.stringify(arr, null, 2), 'utf-8');
  } catch (e) {
    console.error('saveSignals error:', e);
  }
}

let signalsStore: TradingSignal[] = loadSignals();

export function addSignal(signal: TradingSignal) {
  if (signalsStore.some((s) => s.id === signal.id)) return;
  signalsStore.unshift(signal);
  if (signalsStore.length > MAX_SIGNALS) signalsStore = signalsStore.slice(0, MAX_SIGNALS);
  saveSignals(signalsStore);
}

export function getSignals(limit = 50): TradingSignal[] {
  return signalsStore.slice(0, limit);
}

/** Сигналы за последние N часов (для анализа за ночь) */
export function getSignalsSince(hoursAgo: number, limit = 500): TradingSignal[] {
  const since = Date.now() - hoursAgo * 60 * 60 * 1000;
  return signalsStore
    .filter((s) => new Date(s.timestamp).getTime() >= since)
    .slice(0, limit);
}

router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  res.json(getSignals(limit));
});

router.get('/:id', (req, res) => {
  const s = signalsStore.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Signal not found' });
  res.json(s);
});

/**
 * POST /api/signals/:id/update-trailing-stop
 * Обновить трейлинг-стоп по текущей цене (Phase 2).
 * Body: { currentPrice: number, currentStop?: number }
 * Returns: { newTrailingStop: number }
 */
router.post('/:id/update-trailing-stop', (req: Request, res: Response) => {
  const s = signalsStore.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Signal not found' });
  const currentPrice = Number(req.body?.currentPrice);
  const currentStop = req.body?.currentStop != null ? Number(req.body.currentStop) : s.stop_loss;
  if (typeof currentPrice !== 'number' || !Number.isFinite(currentPrice)) {
    return res.status(400).json({ error: 'currentPrice (number) required' });
  }
  const entryPrice = s.entry_price ?? currentPrice;
  const direction = (s.direction ?? 'LONG') as 'LONG' | 'SHORT';
  const initialStopPrice = s.trailing_stop_config?.initial_stop ?? s.stop_loss;
  const initialStopPct = entryPrice > 0 ? Math.abs(entryPrice - initialStopPrice) / entryPrice : DEFAULT_TRAILING_CONFIG.initialStopPct;
  const config = s.trailing_stop_config
    ? {
        initialStopPct,
        trailStepPct: s.trailing_stop_config.trail_step_pct ?? DEFAULT_TRAILING_CONFIG.trailStepPct,
        activationProfitPct: s.trailing_stop_config.activation_profit_pct ?? DEFAULT_TRAILING_CONFIG.activationProfitPct
      }
    : DEFAULT_TRAILING_CONFIG;
  const newStop = updateTrailingStop(entryPrice, currentPrice, direction, currentStop, config);
  res.json({ newTrailingStop: newStop });
});

export default router;
