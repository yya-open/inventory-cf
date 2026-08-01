-- 删除三个完全重复的索引:同一张表上同样的列序已经有另一个索引在用,
-- 重复的 B 树只会让每次写入多维护一份,查询计划却一个都用不上。
-- stock_tx(warehouse_id, created_at):保留 idx_stock_tx_wh_created_at(sql/schema.sql、sql/init.sql)。
DROP INDEX IF EXISTS idx_stock_tx_wh_created;
-- audit_log(username, created_at):保留 idx_audit_log_username_created_at(sql/schema.sql)。
DROP INDEX IF EXISTS idx_audit_log_username_created;
-- pc_asset_latest_state(current_department, asset_id):保留 idx_pc_asset_latest_state_current_department
-- (sql/migrate_snapshot_counters_search_atomic_settings.sql,并由 functions/api/services/pc-latest-state.ts 运行时兜底创建)。
DROP INDEX IF EXISTS idx_pc_asset_latest_state_department_asset;
