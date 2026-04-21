CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_id
ON monitor_assets(archived, id);

CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_inventory_status_id
ON monitor_assets(archived, inventory_status, id);

CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_location_id
ON monitor_assets(archived, location_id, id);