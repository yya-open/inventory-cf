ALTER TABLE asset_inventory_batch ADD COLUMN closed_by TEXT;
ALTER TABLE asset_inventory_batch ADD COLUMN summary_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE asset_inventory_batch ADD COLUMN summary_checked_ok INTEGER NOT NULL DEFAULT 0;
ALTER TABLE asset_inventory_batch ADD COLUMN summary_checked_issue INTEGER NOT NULL DEFAULT 0;
ALTER TABLE asset_inventory_batch ADD COLUMN summary_unchecked INTEGER NOT NULL DEFAULT 0;

UPDATE asset_inventory_batch
SET summary_total = COALESCE((SELECT COUNT(1) FROM pc_assets a WHERE a.inventory_batch_id = asset_inventory_batch.id), 0),
    summary_checked_ok = COALESCE((SELECT COUNT(1) FROM pc_assets a WHERE a.inventory_batch_id = asset_inventory_batch.id AND UPPER(COALESCE(a.inventory_status,''))='CHECKED_OK'), 0),
    summary_checked_issue = COALESCE((SELECT COUNT(1) FROM pc_assets a WHERE a.inventory_batch_id = asset_inventory_batch.id AND UPPER(COALESCE(a.inventory_status,''))='CHECKED_ISSUE'), 0),
    summary_unchecked = COALESCE((SELECT COUNT(1) FROM pc_assets a WHERE a.inventory_batch_id = asset_inventory_batch.id AND (UPPER(COALESCE(a.inventory_status,''))='UNCHECKED' OR COALESCE(a.inventory_status,'')='')), 0)
WHERE kind='pc';

UPDATE asset_inventory_batch
SET summary_total = COALESCE((SELECT COUNT(1) FROM monitor_assets a WHERE a.inventory_batch_id = asset_inventory_batch.id), 0),
    summary_checked_ok = COALESCE((SELECT COUNT(1) FROM monitor_assets a WHERE a.inventory_batch_id = asset_inventory_batch.id AND UPPER(COALESCE(a.inventory_status,''))='CHECKED_OK'), 0),
    summary_checked_issue = COALESCE((SELECT COUNT(1) FROM monitor_assets a WHERE a.inventory_batch_id = asset_inventory_batch.id AND UPPER(COALESCE(a.inventory_status,''))='CHECKED_ISSUE'), 0),
    summary_unchecked = COALESCE((SELECT COUNT(1) FROM monitor_assets a WHERE a.inventory_batch_id = asset_inventory_batch.id AND (UPPER(COALESCE(a.inventory_status,''))='UNCHECKED' OR COALESCE(a.inventory_status,'')='')), 0)
WHERE kind='monitor';
