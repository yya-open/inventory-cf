-- P1 性能索引补充（warnings / 明细 / 报表）
-- 可重复执行：IF NOT EXISTS

CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_created ON stock_tx(warehouse_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_item_created ON stock_tx(warehouse_id, item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_wh_item ON stock(warehouse_id, item_id);

-- audit_log 常用筛选：按用户 + 时间
CREATE INDEX IF NOT EXISTS idx_audit_log_username_created ON audit_log(username, created_at);
