PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS stocktake (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  st_no TEXT NOT NULL UNIQUE,
  warehouse_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('DRAFT','APPLYING','APPLIED','ROLLING')) DEFAULT 'DRAFT',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  applied_at TEXT,
  FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);

CREATE INDEX IF NOT EXISTS idx_stocktake_created_at ON stocktake(created_at);

CREATE TABLE IF NOT EXISTS stocktake_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stocktake_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  system_qty INTEGER NOT NULL DEFAULT 0,
  counted_qty INTEGER,
  diff_qty INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(stocktake_id, item_id),
  FOREIGN KEY(stocktake_id) REFERENCES stocktake(id),
  FOREIGN KEY(item_id) REFERENCES items(id)
);

CREATE INDEX IF NOT EXISTS idx_stocktake_line_st ON stocktake_line(stocktake_id);
