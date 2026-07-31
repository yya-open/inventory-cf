-- 预警列表/导出的 latest_tx 子查询:WHERE warehouse_id=? GROUP BY item_id 取 MAX(created_at)
-- (functions/api/services/inventory.ts: buildWarningsBaseSql / listWarningsExportRows)。
-- 已有的 idx_stock_tx_wh_created_at(warehouse_id, created_at) 服务不了按 item_id 的分组,
-- idx_stock_tx_item_created_at(item_id, created_at) 又没有 warehouse_id 前缀。
-- (warehouse_id, item_id, created_at) 让分组按索引顺序直接产出,每组的 MAX 就是该组末尾项,
-- 无需回表也无需排序。
CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_item_created
ON stock_tx(warehouse_id, item_id, created_at);
