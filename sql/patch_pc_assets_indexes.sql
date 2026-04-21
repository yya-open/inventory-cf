CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_id
ON pc_assets(archived, id);

CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_inventory_status_id
ON pc_assets(archived, inventory_status, id);