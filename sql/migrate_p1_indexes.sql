-- P1 indexes & idempotency
-- Safe to run multiple times.

-- Idempotency: ensure rid:* ref_no is unique (used by stock-in / stock-out)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_tx_ref_no_rid
  ON stock_tx(ref_no)
  WHERE ref_no LIKE 'rid:%';

-- Common query patterns
CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_created_at ON stock_tx(warehouse_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_tx_item_created_at ON stock_tx(item_id, created_at);

CREATE INDEX IF NOT EXISTS idx_stock_wh_item ON stock(warehouse_id, item_id);

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_created_at ON audit_log(action, created_at);
