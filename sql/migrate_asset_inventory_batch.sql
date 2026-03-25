CREATE TABLE IF NOT EXISTS asset_inventory_batch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('pc','monitor')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED')),
  started_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  closed_at TEXT,
  created_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
CREATE INDEX IF NOT EXISTS idx_asset_inventory_batch_kind_status_started ON asset_inventory_batch(kind, status, started_at DESC, id DESC);

ALTER TABLE pc_assets ADD COLUMN inventory_batch_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_pc_assets_inventory_batch_id ON pc_assets(inventory_batch_id, id);

ALTER TABLE monitor_assets ADD COLUMN inventory_batch_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_monitor_assets_inventory_batch_id ON monitor_assets(inventory_batch_id, id);

ALTER TABLE pc_inventory_log ADD COLUMN batch_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_pc_inventory_log_batch_id_asset_created ON pc_inventory_log(batch_id, asset_id, created_at DESC, id DESC);

ALTER TABLE monitor_inventory_log ADD COLUMN batch_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_monitor_inventory_log_batch_id_asset_created ON monitor_inventory_log(batch_id, asset_id, created_at DESC, id DESC);

INSERT INTO asset_inventory_batch (kind, name, status, started_at, closed_at, created_by, updated_at)
SELECT 'pc', '历史盘点（迁移前）', 'CLOSED',
       COALESCE((SELECT MIN(created_at) FROM pc_inventory_log), datetime('now','+8 hours')),
       COALESCE((SELECT MAX(created_at) FROM pc_inventory_log), datetime('now','+8 hours')),
       'migration', datetime('now','+8 hours')
WHERE EXISTS (SELECT 1 FROM pc_inventory_log)
  AND NOT EXISTS (SELECT 1 FROM asset_inventory_batch WHERE kind='pc');

UPDATE pc_inventory_log
SET batch_id = (
  SELECT id FROM asset_inventory_batch WHERE kind='pc' ORDER BY id DESC LIMIT 1
)
WHERE batch_id IS NULL
  AND EXISTS (SELECT 1 FROM asset_inventory_batch WHERE kind='pc');

UPDATE pc_assets
SET inventory_batch_id = (
  SELECT id FROM asset_inventory_batch WHERE kind='pc' ORDER BY id DESC LIMIT 1
)
WHERE inventory_batch_id IS NULL
  AND EXISTS (SELECT 1 FROM asset_inventory_batch WHERE kind='pc')
  AND (COALESCE(inventory_status, 'UNCHECKED') <> 'UNCHECKED' OR inventory_at IS NOT NULL);

INSERT INTO asset_inventory_batch (kind, name, status, started_at, closed_at, created_by, updated_at)
SELECT 'monitor', '历史盘点（迁移前）', 'CLOSED',
       COALESCE((SELECT MIN(created_at) FROM monitor_inventory_log), datetime('now','+8 hours')),
       COALESCE((SELECT MAX(created_at) FROM monitor_inventory_log), datetime('now','+8 hours')),
       'migration', datetime('now','+8 hours')
WHERE EXISTS (SELECT 1 FROM monitor_inventory_log)
  AND NOT EXISTS (SELECT 1 FROM asset_inventory_batch WHERE kind='monitor');

UPDATE monitor_inventory_log
SET batch_id = (
  SELECT id FROM asset_inventory_batch WHERE kind='monitor' ORDER BY id DESC LIMIT 1
)
WHERE batch_id IS NULL
  AND EXISTS (SELECT 1 FROM asset_inventory_batch WHERE kind='monitor');

UPDATE monitor_assets
SET inventory_batch_id = (
  SELECT id FROM asset_inventory_batch WHERE kind='monitor' ORDER BY id DESC LIMIT 1
)
WHERE inventory_batch_id IS NULL
  AND EXISTS (SELECT 1 FROM asset_inventory_batch WHERE kind='monitor')
  AND (COALESCE(inventory_status, 'UNCHECKED') <> 'UNCHECKED' OR inventory_at IS NOT NULL);
