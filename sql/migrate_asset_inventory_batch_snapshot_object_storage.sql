ALTER TABLE asset_inventory_batch ADD COLUMN snapshot_object_key TEXT;
ALTER TABLE asset_inventory_batch ADD COLUMN snapshot_file_size INTEGER;
ALTER TABLE async_jobs ADD COLUMN result_object_key TEXT;
ALTER TABLE async_jobs ADD COLUMN result_file_size INTEGER;
