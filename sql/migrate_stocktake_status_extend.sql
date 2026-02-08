-- Extend stocktake.status CHECK constraint to support intermediate states
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS stocktake__new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  st_no TEXT NOT NULL UNIQUE,
  warehouse_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('DRAFT','APPLYING','APPLIED','ROLLING')) DEFAULT 'DRAFT',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  applied_at TEXT,
  FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);

INSERT INTO stocktake__new (id, st_no, warehouse_id, status, created_at, created_by, applied_at)
SELECT id, st_no, warehouse_id, status, created_at, created_by, applied_at
FROM stocktake;

DROP TABLE stocktake;
ALTER TABLE stocktake__new RENAME TO stocktake;

CREATE INDEX IF NOT EXISTS idx_stocktake_created_at ON stocktake(created_at);

PRAGMA foreign_keys = ON;
