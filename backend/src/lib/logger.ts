/**
 * Simple structured logger for backend.
 * Сохраняет последние N строк в буфер для отображения в админке.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const MIN_LEVEL: LogLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel || 'info';
const MIN_LEVEL_NUM = LEVEL_ORDER[MIN_LEVEL] ?? 1;

const MAX_LOG_LINES = 1000;
const logBuffer: { ts: string; level: string; tag: string; message: string; meta?: string }[] = [];

function pushToBuffer(ts: string, level: string, tag: string, message: string, meta?: string): void {
  logBuffer.push({ ts, level, tag, message, meta });
  if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();
}

function log(level: LogLevel, tag: string, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < MIN_LEVEL_NUM) return;
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${ts}] [${level.toUpperCase()}] [${tag}] ${message}${metaStr}`;
  pushToBuffer(ts, level.toUpperCase(), tag, message, meta ? JSON.stringify(meta) : undefined);
  switch (level) {
    case 'debug':
      console.debug(line);
      break;
    case 'info':
      console.log(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
  }
}

/** Последние логи для админки (GET /api/admin/logs) */
export function getRecentLogs(limit = 500): { ts: string; level: string; tag: string; message: string; meta?: string }[] {
  const start = Math.max(0, logBuffer.length - limit);
  return logBuffer.slice(start);
}

export const logger = {
  debug(tag: string, msg: string, meta?: Record<string, unknown>) {
    log('debug', tag, msg, meta);
  },
  info(tag: string, msg: string, meta?: Record<string, unknown>) {
    log('info', tag, msg, meta);
  },
  warn(tag: string, msg: string, meta?: Record<string, unknown>) {
    log('warn', tag, msg, meta);
  },
  error(tag: string, msg: string, meta?: Record<string, unknown>) {
    log('error', tag, msg, meta);
  }
};
