-- Extend stocktake.status CHECK constraint to support intermediate states
-- ('APPLYING','ROLLING') used by the app for resumable apply/rollback.
--
-- NOTE: SQLite cannot ALTER CHECK constraint in-place; we rebuild the table.
-- Safe to run once on an existing DB.

PRAGMA foreign_keys = OFF;
BEGIN;

-- Create new table with extended constraint
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

-- Copy data
INSERT INTO stocktake__new (id, st_no, warehouse_id, status, created_at, created_by, applied_at)
SELECT id, st_no, warehouse_id, status, created_at, created_by, applied_at
FROM stocktake;

DROP TABLE stocktake;
ALTER TABLE stocktake__new RENAME TO stocktake;

-- Recreate indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_stocktake_created_at ON stocktake(created_at);

COMMIT;
PRAGMA foreign_keys = ON;
