ALTER TABLE asset_inventory_batch ADD COLUMN snapshot_job_id INTEGER;
ALTER TABLE asset_inventory_batch ADD COLUMN snapshot_job_status TEXT;
ALTER TABLE asset_inventory_batch ADD COLUMN snapshot_error_message TEXT;
ALTER TABLE async_jobs ADD COLUMN result_blob_base64 TEXT;
