-- CryptoSignal Pro - SQLite Schema (ТЗ раздел База данных)

-- Таблица сигналов
CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    pair TEXT NOT NULL,
    direction TEXT CHECK(direction IN ('LONG', 'SHORT')),
    entry_price REAL NOT NULL,
    stop_loss REAL NOT NULL,
    take_profits TEXT NOT NULL,
    risk_reward REAL,
    confidence INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    trigger_type TEXT,
    exchange TEXT,
    timeframe TEXT,
    status TEXT DEFAULT 'active',
    analysis_data TEXT
);

-- Таблица демо-сделок
CREATE TABLE IF NOT EXISTS demo_trades (
    id TEXT PRIMARY KEY,
    signal_id TEXT REFERENCES signals(id),
    open_price REAL NOT NULL,
    close_price REAL,
    size REAL NOT NULL,
    direction TEXT,
    pnl REAL,
    pnl_percent REAL,
    open_time DATETIME,
    close_time DATETIME,
    status TEXT DEFAULT 'open'
);

-- Таблица настроек
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица истории анализа
CREATE TABLE IF NOT EXISTS analysis_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pair TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    candle_data TEXT,
    orderbook_data TEXT,
    indicators TEXT,
    result TEXT
);

-- Таблица ордеров (все пользователи: демо и реальные)
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    pair TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('LONG', 'SHORT')),
    size REAL NOT NULL,
    leverage INTEGER NOT NULL DEFAULT 1,
    open_price REAL NOT NULL,
    close_price REAL,
    stop_loss REAL,
    take_profit TEXT,
    pnl REAL,
    pnl_percent REAL,
    open_time TEXT NOT NULL,
    close_time TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
    auto_opened INTEGER NOT NULL DEFAULT 0,
    confidence_at_open REAL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_open_time ON orders(open_time);
CREATE INDEX IF NOT EXISTS idx_signals_pair ON signals(pair);
CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_demo_trades_status ON demo_trades(status);

-- Группы и доступ к вкладкам (Super-Admin)
CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    allowed_tabs TEXT NOT NULL DEFAULT '[]'
);
INSERT OR IGNORE INTO groups (id, name, allowed_tabs) VALUES
(1, 'user', '["dashboard","settings","activate"]'),
(2, 'viewer', '["dashboard","signals","chart"]'),
(3, 'admin', '["dashboard","signals","chart","demo","autotrade","scanner","pnl","settings","admin"]');

-- Пользователи (регистрация без подтверждения почты)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    group_id INTEGER NOT NULL DEFAULT 1,
    proxy_url TEXT,
    activation_expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_group_id ON users(group_id);

-- Сессии (токен -> user_id)
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Ключи активации (Super-Admin генерирует, пользователь активирует)
CREATE TABLE IF NOT EXISTS activation_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    duration_days INTEGER NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    used_by_user_id TEXT,
    used_at TEXT,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_activation_keys_key ON activation_keys(key);
CREATE INDEX IF NOT EXISTS idx_activation_keys_used ON activation_keys(used_at);

-- Pro группа (после активации). Вкладка activate доступна всегда.
INSERT OR IGNORE INTO groups (id, name, allowed_tabs) VALUES
(4, 'pro', '["dashboard","signals","chart","demo","autotrade","scanner","pnl","settings","activate"]');
