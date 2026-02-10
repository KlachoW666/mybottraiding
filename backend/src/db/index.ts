/**
 * SQLite DB: инициализация, ордера (все пользователи).
 * При ошибке загрузки better-sqlite3 (например в Electron — другая версия Node)
 * используется in-memory хранилище, чтобы приложение и админка работали.
 */

import path from 'path';
import fs from 'fs';

const DB_DIR = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.join(process.cwd(), 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DB_DIR, 'cryptosignal.db');

let db: any = null;
let useMemoryStore = false;
let initAttempted = false;

const memoryOrders: MemoryOrderRow[] = [];

interface MemoryOrderRow {
  id: string;
  client_id: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  open_price: number;
  close_price: number | null;
  stop_loss: number | null;
  take_profit: string | null;
  pnl: number | null;
  pnl_percent: number | null;
  open_time: string;
  close_time: string | null;
  status: 'open' | 'closed';
  auto_opened: number;
  confidence_at_open: number | null;
  created_at: string;
}

function getSchemaPath(): string {
  const candidates = [
    path.join(process.cwd(), 'backend', 'src', 'db', 'schema.sql'),
    path.join(process.cwd(), 'src', 'db', 'schema.sql'),
    path.join(__dirname, 'schema.sql')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function loadNative(): any {
  try {
    return require('better-sqlite3');
  } catch {
    return null;
  }
}

/** Инициализация БД. Не бросает исключений: при ошибке включается in-memory режим. */
export function initDb(): any {
  if (initAttempted) return useMemoryStore ? null : db;
  initAttempted = true;
  const Database = loadNative();
  if (!Database) {
    useMemoryStore = true;
    return null;
  }
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    const schemaPath = getSchemaPath();
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      db.exec(sql);
    }
    return db;
  } catch {
    useMemoryStore = true;
    db = null;
    return null;
  }
}

export function getDb(): any {
  if (!initAttempted) initDb();
  return useMemoryStore ? null : db;
}

/** Режим in-memory (нет SQLite) — для отображения в админке. */
export function isMemoryStore(): boolean {
  if (!initAttempted) initDb();
  return useMemoryStore;
}

export interface OrderRow {
  id: string;
  client_id: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  open_price: number;
  close_price: number | null;
  stop_loss: number | null;
  take_profit: string | null;
  pnl: number | null;
  pnl_percent: number | null;
  open_time: string;
  close_time: string | null;
  status: 'open' | 'closed';
  auto_opened: number;
  confidence_at_open: number | null;
  created_at: string;
}

export function insertOrder(order: {
  id: string;
  clientId: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  leverage: number;
  openPrice: number;
  stopLoss?: number;
  takeProfit?: number[];
  openTime: string;
  status?: 'open' | 'closed';
  autoOpened?: boolean;
  confidenceAtOpen?: number;
}): void {
  if (!initAttempted) initDb();
  if (useMemoryStore) {
    const row: MemoryOrderRow = {
      id: order.id,
      client_id: order.clientId,
      pair: order.pair,
      direction: order.direction,
      size: order.size,
      leverage: order.leverage,
      open_price: order.openPrice,
      close_price: null,
      stop_loss: order.stopLoss ?? null,
      take_profit: order.takeProfit?.length ? JSON.stringify(order.takeProfit) : null,
      pnl: null,
      pnl_percent: null,
      open_time: order.openTime,
      close_time: null,
      status: order.status ?? 'open',
      auto_opened: order.autoOpened ? 1 : 0,
      confidence_at_open: order.confidenceAtOpen ?? null,
      created_at: new Date().toISOString()
    };
    const i = memoryOrders.findIndex((o) => o.id === order.id);
    if (i >= 0) memoryOrders[i] = row;
    else memoryOrders.unshift(row);
    return;
  }
  const d = getDb();
  if (!d) return;
  const stmt = d.prepare(`
    INSERT OR REPLACE INTO orders (id, client_id, pair, direction, size, leverage, open_price, close_price, stop_loss, take_profit, pnl, pnl_percent, open_time, close_time, status, auto_opened, confidence_at_open)
    VALUES (@id, @clientId, @pair, @direction, @size, @leverage, @openPrice, @closePrice, @stopLoss, @takeProfit, @pnl, @pnlPercent, @openTime, @closeTime, @status, @autoOpened, @confidenceAtOpen)
  `);
  stmt.run({
    id: order.id,
    clientId: order.clientId,
    pair: order.pair,
    direction: order.direction,
    size: order.size,
    leverage: order.leverage,
    openPrice: order.openPrice,
    closePrice: null,
    stopLoss: order.stopLoss ?? null,
    takeProfit: order.takeProfit?.length ? JSON.stringify(order.takeProfit) : null,
    pnl: null,
    pnlPercent: null,
    openTime: order.openTime,
    closeTime: null,
    status: order.status ?? 'open',
    autoOpened: order.autoOpened ? 1 : 0,
    confidenceAtOpen: order.confidenceAtOpen ?? null
  });
}

export function updateOrderClose(order: {
  id: string;
  closePrice: number;
  pnl: number;
  pnlPercent: number;
  closeTime: string;
}): void {
  if (!initAttempted) initDb();
  if (useMemoryStore) {
    const row = memoryOrders.find((o) => o.id === order.id);
    if (row) {
      row.close_price = order.closePrice;
      row.pnl = order.pnl;
      row.pnl_percent = order.pnlPercent;
      row.close_time = order.closeTime;
      row.status = 'closed';
    }
    return;
  }
  const d = getDb();
  if (!d) return;
  const stmt = d.prepare(`
    UPDATE orders SET close_price = @closePrice, pnl = @pnl, pnl_percent = @pnlPercent, close_time = @closeTime, status = 'closed' WHERE id = @id
  `);
  stmt.run({
    id: order.id,
    closePrice: order.closePrice,
    pnl: order.pnl,
    pnlPercent: order.pnlPercent,
    closeTime: order.closeTime
  });
}

export function listOrders(opts?: { clientId?: string; status?: 'open' | 'closed'; limit?: number }): OrderRow[] {
  if (!initAttempted) initDb();
  if (useMemoryStore) {
    let list = [...memoryOrders];
    if (opts?.clientId) list = list.filter((o) => o.client_id === opts.clientId);
    if (opts?.status) list = list.filter((o) => o.status === opts.status);
    list.sort((a, b) => (b.open_time || '').localeCompare(a.open_time || ''));
    const limit = opts?.limit ?? 100;
    return list.slice(0, limit) as OrderRow[];
  }
  const d = getDb();
  if (!d) return [];
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params: Record<string, string | number> = {};
  if (opts?.clientId) {
    sql += ' AND client_id = @clientId';
    params.clientId = opts.clientId;
  }
  if (opts?.status) {
    sql += ' AND status = @status';
    params.status = opts.status;
  }
  sql += ' ORDER BY open_time DESC';
  if (opts?.limit) {
    sql += ' LIMIT @limit';
    params.limit = opts.limit;
  }
  const stmt = d.prepare(sql);
  return stmt.all(params) as OrderRow[];
}
