-- P1 性能索引补充（warnings / 明细 / 报表）
-- 可重复执行：IF NOT EXISTS

CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_created ON stock_tx(warehouse_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_item_created ON stock_tx(warehouse_id, item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_wh_item ON stock(warehouse_id, item_id);


-- 审计日志查询索引（筛选/时间范围）
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action_created ON audit_log(action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity_created ON audit_log(entity, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_username_created ON audit_log(username, created_at);
