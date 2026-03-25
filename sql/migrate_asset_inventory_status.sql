ALTER TABLE pc_assets ADD COLUMN inventory_status TEXT NOT NULL DEFAULT 'UNCHECKED';
ALTER TABLE pc_assets ADD COLUMN inventory_at TEXT;
ALTER TABLE pc_assets ADD COLUMN inventory_issue_type TEXT;
CREATE INDEX IF NOT EXISTS idx_pc_assets_inventory_status_id ON pc_assets(inventory_status, id);
UPDATE pc_assets
SET inventory_status = COALESCE((
    SELECT CASE l.action
      WHEN 'ISSUE' THEN 'CHECKED_ISSUE'
      WHEN 'OK' THEN 'CHECKED_OK'
      ELSE 'UNCHECKED'
    END
    FROM pc_inventory_log l
    WHERE l.asset_id = pc_assets.id
    ORDER BY datetime(l.created_at) DESC, l.id DESC
    LIMIT 1
  ), 'UNCHECKED'),
  inventory_at = (
    SELECT created_at FROM pc_inventory_log l
    WHERE l.asset_id = pc_assets.id
    ORDER BY datetime(l.created_at) DESC, l.id DESC
    LIMIT 1
  ),
  inventory_issue_type = (
    SELECT CASE WHEN l.action = 'ISSUE' THEN l.issue_type ELSE NULL END
    FROM pc_inventory_log l
    WHERE l.asset_id = pc_assets.id
    ORDER BY datetime(l.created_at) DESC, l.id DESC
    LIMIT 1
  )
WHERE 1=1;

ALTER TABLE monitor_assets ADD COLUMN inventory_status TEXT NOT NULL DEFAULT 'UNCHECKED';
ALTER TABLE monitor_assets ADD COLUMN inventory_at TEXT;
ALTER TABLE monitor_assets ADD COLUMN inventory_issue_type TEXT;
CREATE INDEX IF NOT EXISTS idx_monitor_assets_inventory_status_id ON monitor_assets(inventory_status, id);
UPDATE monitor_assets
SET inventory_status = COALESCE((
    SELECT CASE l.action
      WHEN 'ISSUE' THEN 'CHECKED_ISSUE'
      WHEN 'OK' THEN 'CHECKED_OK'
      ELSE 'UNCHECKED'
    END
    FROM monitor_inventory_log l
    WHERE l.asset_id = monitor_assets.id
    ORDER BY datetime(l.created_at) DESC, l.id DESC
    LIMIT 1
  ), 'UNCHECKED'),
  inventory_at = (
    SELECT created_at FROM monitor_inventory_log l
    WHERE l.asset_id = monitor_assets.id
    ORDER BY datetime(l.created_at) DESC, l.id DESC
    LIMIT 1
  ),
  inventory_issue_type = (
    SELECT CASE WHEN l.action = 'ISSUE' THEN l.issue_type ELSE NULL END
    FROM monitor_inventory_log l
    WHERE l.asset_id = monitor_assets.id
    ORDER BY datetime(l.created_at) DESC, l.id DESC
    LIMIT 1
  )
WHERE 1=1;
