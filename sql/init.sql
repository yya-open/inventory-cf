PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  category TEXT,
  unit TEXT NOT NULL DEFAULT '个',
  warning_qty INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id, warehouse_id),
  FOREIGN KEY(item_id) REFERENCES items(id),
  FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);

CREATE TABLE IF NOT EXISTS stock_tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_no TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('IN','OUT','ADJUST','REVERSAL')),
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  delta_qty INTEGER NOT NULL DEFAULT 0,
  unit_price REAL,
  source TEXT,
  target TEXT,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY(item_id) REFERENCES items(id),
  FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_tx_created_at ON stock_tx(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_tx_item ON stock_tx(item_id);


-- Users & Auth
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','operator','viewer')) DEFAULT 'admin',
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Login throttle (防爆破/限流)
CREATE TABLE IF NOT EXISTS auth_login_throttle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  username TEXT NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  first_fail_at TEXT,
  last_fail_at TEXT,
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ip, username)
);

CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_locked ON auth_login_throttle(locked_until);



INSERT OR IGNORE INTO warehouses (id, name) VALUES (1, '主仓');

INSERT OR IGNORE INTO items (id, sku, name, brand, model, category, unit, warning_qty) VALUES
(1, 'RAM-16G-DDR4-3200', '内存条 16G DDR4 3200', 'Kingston', 'DDR4-3200', '内存', '条', 2),
(2, 'SSD-1T-NVME', 'NVMe SSD 1TB', 'Samsung', '980', '硬盘', '块', 1);


-- Default admin (please change password after first login)
INSERT OR IGNORE INTO users (id, username, password_hash, role, is_active, must_change_password)
VALUES (1, 'admin', 'pbkdf2$100000$MEg44sOf2APw8x1HQEipVQ$x1a47ows6TbAAFmg4n4gBKAzZtPD0fEX7D8lHXitiQ0', 'admin', 1, 1);
