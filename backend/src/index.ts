import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Загрузка .env: при запуске из Electron cwd = корень проекта — грузим backend/.env
const cwd = process.cwd();
const rootEnv = path.join(cwd, '.env');
const backendEnv = path.join(cwd, 'backend', '.env');
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
if (fs.existsSync(backendEnv)) dotenv.config({ path: backendEnv });
if (!fs.existsSync(rootEnv) && !fs.existsSync(backendEnv)) dotenv.config();

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';

import { config } from './config';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import signalsRouter from './routes/signals';
import marketRouter from './routes/market';
import mlRouter from './routes/ml';
import connectionsRouter from './routes/connections';
import notifyRouter from './routes/notify';
import scannerRouter from './routes/scanner';
import tradingRouter from './routes/trading';
import backtestRouter from './routes/backtest';
import ordersRouter from './routes/orders';
import authRouter from './routes/auth';
import statsRouter from './routes/stats';
import adminRouter from './routes/admin';
import { createWebSocketServer, getBroadcastBreakout } from './websocket';
import { initDb, isMemoryStore } from './db';
import { seedDefaultAdmin } from './db/seed';
import { notifyBreakoutAlert } from './services/notificationService';
import { startBreakoutMonitor } from './services/breakoutMonitor';

const app = express();
const server = createServer(app);
createWebSocketServer(server);
startBreakoutMonitor({
  intervalMs: 15_000,
  topN: 5,
  minConfidence: 0.75,
  onAlert: (alert) => {
    getBroadcastBreakout()?.(alert);
    notifyBreakoutAlert({
      symbol: alert.symbol,
      direction: alert.breakout.direction,
      confidence: alert.breakout.confidence,
      levelPrice: alert.breakout.level?.price,
      entryZone: alert.breakout.entryZone
    });
  }
});

app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.use('/api/signals', signalsRouter);
app.use('/api/market', marketRouter);
app.use('/api/ml', mlRouter);
app.use('/api/connections', connectionsRouter);
app.use('/api/notify', notifyRouter);
app.use('/api/scanner', scannerRouter);
app.use('/api/trading', tradingRouter);
app.use('/api/backtest', backtestRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/auth', authRouter);
app.use('/api/stats', statsRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'CryptoSignal Pro API', exchange: 'OKX' });
});

app.use(errorHandler);

function getFrontendPath(): string | null {
  const candidates: string[] = [];
  const inElectron = typeof process !== 'undefined' && (process as NodeJS.Process & { versions?: { electron?: string } }).versions?.electron;
  if (inElectron) {
    const cwd = process.cwd();
    candidates.push(path.resolve(cwd, 'frontend', 'dist'));
    try {
      const { app: electronApp } = require('electron');
      candidates.push(path.join(electronApp.getAppPath(), 'frontend', 'dist'));
    } catch {}
  }
  candidates.push(path.resolve(__dirname, '../../frontend/dist'));
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'index.html'))) {
      return path.resolve(dir);
    }
  }
  return null;
}

const frontendPath = getFrontendPath();
if (frontendPath) {
  logger.info('Server', `Frontend: ${frontendPath}`);
  app.use(express.static(frontendPath, { index: false }));
  app.get('*', (_, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
} else {
  const triedPaths = [
    path.resolve(process.cwd(), 'frontend', 'dist'),
    path.resolve(__dirname, '../../frontend/dist')
  ];
  logger.info('Server', `Frontend not found. Tried: ${triedPaths.join('; ')}`);
  app.get('*', (_, res) => {
    res.status(200).contentType('text/html').send(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Ошибка</title></head>
      <body style="font-family:sans-serif;padding:2rem;background:#1a1a1a;color:#eee;">
        <h1>Фронтенд не найден</h1>
        <p>Папка frontend/dist не найдена. Выполните в корне проекта: <code>npm run build</code></p>
        <p>Проверенные пути:</p><ul>${triedPaths.map((p) => `<li>${p}</li>`).join('')}</ul>
      </body></html>`);
  });
}

export async function startServer(port: number = config.port): Promise<void> {
  initDb();
  seedDefaultAdmin();
  logger.info('Server', isMemoryStore() ? 'Database: in-memory (native SQLite unavailable)' : 'Database: SQLite initialized');
  return new Promise((resolve) => {
    server.listen(port, () => {
      logger.info('Server', `API: http://localhost:${port}`);
      logger.info('Server', `WebSocket: ws://localhost:${port}/ws`);
      resolve();
    });
  });
}

// Run standalone if executed directly (npm run start)
if (require.main === module) {
  startServer();
}
