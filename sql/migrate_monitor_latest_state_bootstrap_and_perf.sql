PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS monitor_asset_latest_state (
  asset_id INTEGER PRIMARY KEY,
  last_tx_id INTEGER,
  last_tx_type TEXT,
  last_tx_at TEXT,
  current_location_id INTEGER,
  current_employee_no TEXT,
  current_employee_name TEXT,
  current_department TEXT,
  current_tx_type TEXT,
  current_tx_id INTEGER,
  current_tx_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  FOREIGN KEY(asset_id) REFERENCES monitor_assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monitor_tx_asset_created_id ON monitor_tx(asset_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_type_created_id ON monitor_tx(tx_type, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_no ON monitor_tx(tx_no);
CREATE INDEX IF NOT EXISTS idx_monitor_asset_latest_state_current_department ON monitor_asset_latest_state(current_department, asset_id);
CREATE INDEX IF NOT EXISTS idx_monitor_asset_latest_state_current_tx ON monitor_asset_latest_state(current_tx_type, current_tx_id, asset_id);

INSERT INTO monitor_asset_latest_state (
  asset_id,
  last_tx_id,
  last_tx_type,
  last_tx_at,
  current_location_id,
  current_employee_no,
  current_employee_name,
  current_department,
  current_tx_type,
  current_tx_id,
  current_tx_at,
  updated_at
)
WITH ranked AS (
  SELECT
    t.*,
    ROW_NUMBER() OVER (PARTITION BY t.asset_id ORDER BY t.created_at DESC, t.id DESC) AS rn
  FROM monitor_tx t
)
SELECT
  r.asset_id,
  r.id AS last_tx_id,
  r.tx_type AS last_tx_type,
  r.created_at AS last_tx_at,
  COALESCE(r.to_location_id, r.from_location_id) AS current_location_id,
  CASE WHEN r.tx_type IN ('IN','RETURN','SCRAP') THEN NULL ELSE r.employee_no END AS current_employee_no,
  CASE WHEN r.tx_type IN ('IN','RETURN','SCRAP') THEN NULL ELSE r.employee_name END AS current_employee_name,
  CASE WHEN r.tx_type IN ('IN','RETURN','SCRAP') THEN NULL ELSE r.department END AS current_department,
  r.tx_type AS current_tx_type,
  r.id AS current_tx_id,
  r.created_at AS current_tx_at,
  datetime('now', '+8 hours') AS updated_at
FROM ranked r
WHERE r.rn = 1
ON CONFLICT(asset_id) DO UPDATE SET
  last_tx_id = excluded.last_tx_id,
  last_tx_type = excluded.last_tx_type,
  last_tx_at = excluded.last_tx_at,
  current_location_id = excluded.current_location_id,
  current_employee_no = excluded.current_employee_no,
  current_employee_name = excluded.current_employee_name,
  current_department = excluded.current_department,
  current_tx_type = excluded.current_tx_type,
  current_tx_id = excluded.current_tx_id,
  current_tx_at = excluded.current_tx_at,
  updated_at = excluded.updated_at;

PRAGMA foreign_keys = ON;
