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
