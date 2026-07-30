CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_location_id
ON monitor_assets(archived, location_id, id);
