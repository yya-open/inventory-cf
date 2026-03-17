-- Additional covering indexes for high-frequency list / count / stocktake / public throttle queries.
-- Safe to run multiple times.

CREATE INDEX IF NOT EXISTS idx_items_enabled_sku ON items(enabled, sku);
CREATE INDEX IF NOT EXISTS idx_items_enabled_name ON items(enabled, name);

CREATE INDEX IF NOT EXISTS idx_stock_tx_type_created_at ON stock_tx(type, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_type_created_at ON stock_tx(warehouse_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_tx_ref_type_ref_id_item_wh ON stock_tx(ref_type, ref_id, item_id, warehouse_id);

CREATE INDEX IF NOT EXISTS idx_stocktake_wh_status_created_at ON stocktake(warehouse_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_stocktake_status_created_at ON stocktake(status, created_at);
CREATE INDEX IF NOT EXISTS idx_stocktake_line_stocktake_counted ON stocktake_line(stocktake_id, counted_qty);

CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_ip_username_locked ON auth_login_throttle(ip, username, locked_until);
CREATE INDEX IF NOT EXISTS idx_public_api_throttle_updated_at ON public_api_throttle(updated_at);

CREATE INDEX IF NOT EXISTS idx_pc_assets_status_id ON pc_assets(status, id);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_status_location_id ON monitor_assets(status, location_id, id);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_type_created_at ON monitor_tx(tx_type, created_at);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_asset_type_created_at ON monitor_tx(asset_id, tx_type, created_at);

CREATE INDEX IF NOT EXISTS idx_pc_in_asset_id_id ON pc_in(asset_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_pc_out_asset_id_id ON pc_out(asset_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_pc_scrap_asset_created_at ON pc_scrap(asset_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_username_created_at ON audit_log(username, created_at);
