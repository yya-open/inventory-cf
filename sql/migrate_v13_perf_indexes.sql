-- v13 targeted indexes for hottest list/count paths
CREATE INDEX IF NOT EXISTS idx_pc_asset_latest_state_department_asset ON pc_asset_latest_state(current_department, asset_id);
CREATE INDEX IF NOT EXISTS idx_pc_asset_latest_state_employee_asset ON pc_asset_latest_state(current_employee_no, asset_id);
CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_status_warranty_id ON pc_assets(archived, status, warranty_end_ts, id);
CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_inventory_status_id ON pc_assets(archived, inventory_status, status, id);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_status_department_location_id ON monitor_assets(archived, status, department, location_id, id);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_inventory_status_location_id ON monitor_assets(archived, inventory_status, status, location_id, id);
CREATE INDEX IF NOT EXISTS idx_pc_out_asset_created_desc ON pc_out(asset_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_asset_created_desc ON monitor_tx(asset_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_slow_request_log_path_created_desc ON slow_request_log(path, created_at DESC, total_ms DESC);
CREATE INDEX IF NOT EXISTS idx_request_error_log_path_created_desc ON request_error_log(path, created_at DESC, status);
