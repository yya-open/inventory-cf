-- hot indexes for first-open ledger list pages (pc / monitor)
-- keeps archived=0 + ORDER BY id list queries on the index and avoids temp sorting

CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_id
ON pc_assets(archived, id);

CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_inventory_status_id
ON pc_assets(archived, inventory_status, id);

CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_id
ON monitor_assets(archived, id);

CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_inventory_status_id
ON monitor_assets(archived, inventory_status, id);
