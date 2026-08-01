-- P1 性能索引补充（warnings / 明细 / 报表）
-- 可重复执行：IF NOT EXISTS
-- 注：idx_stock_tx_wh_created、idx_audit_log_username_created 是重复索引，已在
--     migrate_drop_duplicate_indexes.sql 中删除，改由 idx_stock_tx_wh_created_at、
--     idx_audit_log_username_created_at 承担（见 sql/schema.sql）。

CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_item_created ON stock_tx(warehouse_id, item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_wh_item ON stock(warehouse_id, item_id);
