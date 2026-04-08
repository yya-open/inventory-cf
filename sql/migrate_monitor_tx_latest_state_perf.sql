ALTER TABLE monitor_asset_latest_state ADD COLUMN current_tx_type TEXT;
ALTER TABLE monitor_asset_latest_state ADD COLUMN current_tx_id INTEGER;
ALTER TABLE monitor_asset_latest_state ADD COLUMN current_tx_at TEXT;

CREATE INDEX IF NOT EXISTS idx_monitor_tx_asset_created_id ON monitor_tx(asset_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_type_created_id ON monitor_tx(tx_type, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_no ON monitor_tx(tx_no);
CREATE INDEX IF NOT EXISTS idx_monitor_asset_latest_state_current_department ON monitor_asset_latest_state(current_department, asset_id);
CREATE INDEX IF NOT EXISTS idx_monitor_asset_latest_state_current_tx ON monitor_asset_latest_state(current_tx_type, current_tx_id, asset_id);
