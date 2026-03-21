CREATE INDEX IF NOT EXISTS idx_users_created_at_id ON users(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_users_username_role_active ON users(username, role, is_active);

CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_created_type_item ON stock_tx(warehouse_id, created_at, type, item_id);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_created_type_dept ON monitor_tx(created_at, tx_type, department);
CREATE INDEX IF NOT EXISTS idx_pc_in_created_asset ON pc_in(created_at, asset_id);
CREATE INDEX IF NOT EXISTS idx_pc_out_created_asset ON pc_out(created_at, asset_id);
CREATE INDEX IF NOT EXISTS idx_pc_recycle_action_created_asset ON pc_recycle(action, created_at, asset_id);
CREATE INDEX IF NOT EXISTS idx_pc_scrap_created_asset ON pc_scrap(created_at, asset_id);
CREATE INDEX IF NOT EXISTS idx_pc_asset_latest_state_department_asset ON pc_asset_latest_state(current_department, asset_id);

CREATE INDEX IF NOT EXISTS idx_slow_request_log_created_path ON slow_request_log(created_at DESC, path, status);
CREATE INDEX IF NOT EXISTS idx_request_error_log_created_status ON request_error_log(created_at DESC, status, path);
CREATE INDEX IF NOT EXISTS idx_report_daily_snapshots_scope_day ON report_daily_snapshots(scope_key, snapshot_date, mode, warehouse_id);
