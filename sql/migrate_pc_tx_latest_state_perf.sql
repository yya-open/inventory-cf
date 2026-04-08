ALTER TABLE pc_asset_latest_state ADD COLUMN last_scrap_id INTEGER;
ALTER TABLE pc_asset_latest_state ADD COLUMN last_recycle_at TEXT;
ALTER TABLE pc_asset_latest_state ADD COLUMN last_scrap_at TEXT;
ALTER TABLE pc_asset_latest_state ADD COLUMN current_tx_type TEXT;
ALTER TABLE pc_asset_latest_state ADD COLUMN current_tx_id INTEGER;
ALTER TABLE pc_asset_latest_state ADD COLUMN current_tx_at TEXT;

CREATE INDEX IF NOT EXISTS idx_pc_asset_latest_state_current_tx ON pc_asset_latest_state(current_tx_type, current_tx_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_pc_in_asset_created ON pc_in(asset_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_pc_out_asset_created ON pc_out(asset_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_pc_recycle_asset_created ON pc_recycle(asset_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_pc_scrap_asset_created ON pc_scrap(asset_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_pc_in_no ON pc_in(in_no);
CREATE INDEX IF NOT EXISTS idx_pc_out_no ON pc_out(out_no);
CREATE INDEX IF NOT EXISTS idx_pc_recycle_no ON pc_recycle(recycle_no);
CREATE INDEX IF NOT EXISTS idx_pc_scrap_no ON pc_scrap(scrap_no);
