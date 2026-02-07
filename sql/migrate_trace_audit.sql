-- Add trace fields to stock_tx and create audit_log table
-- NOTE: SQLite/D1 does not support IF NOT EXISTS for ALTER TABLE ADD COLUMN.
-- Run this migration ONCE on an existing database.

PRAGMA foreign_keys = ON;

ALTER TABLE stock_tx ADD COLUMN ref_type TEXT;
ALTER TABLE stock_tx ADD COLUMN ref_id INTEGER;
ALTER TABLE stock_tx ADD COLUMN ref_no TEXT;

CREATE INDEX IF NOT EXISTS idx_stock_tx_ref_no ON stock_tx(ref_no);
CREATE INDEX IF NOT EXISTS idx_stock_tx_ref_id ON stock_tx(ref_id);
CREATE INDEX IF NOT EXISTS idx_stock_tx_ref_type ON stock_tx(ref_type);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  payload_json TEXT,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);
