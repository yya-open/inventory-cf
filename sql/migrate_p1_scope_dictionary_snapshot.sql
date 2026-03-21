ALTER TABLE users ADD COLUMN data_scope_value2 TEXT;

UPDATE users
SET data_scope_type='all'
WHERE COALESCE(TRIM(data_scope_type), '')='';

UPDATE users
SET data_scope_value=NULL,
    data_scope_value2=NULL
WHERE TRIM(COALESCE(data_scope_type, 'all'))='all';

UPDATE users
SET data_scope_value2=NULL
WHERE TRIM(COALESCE(data_scope_type, 'all')) IN ('department','warehouse');

DROP INDEX IF EXISTS idx_users_data_scope_type_value;
CREATE INDEX IF NOT EXISTS idx_users_data_scope_type_value_v2
ON users(data_scope_type, data_scope_value, data_scope_value2);

CREATE TABLE IF NOT EXISTS report_daily_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  mode TEXT NOT NULL,
  warehouse_id INTEGER NOT NULL DEFAULT 0,
  scope_key TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  UNIQUE(snapshot_date, mode, warehouse_id, scope_key)
);
CREATE INDEX IF NOT EXISTS idx_report_daily_snapshots_lookup
ON report_daily_snapshots(mode, warehouse_id, snapshot_date, scope_key);

CREATE TABLE IF NOT EXISTS system_dictionary_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dictionary_key TEXT NOT NULL,
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_by TEXT,
  UNIQUE(dictionary_key, normalized_label)
);

INSERT OR IGNORE INTO system_dictionary_items (dictionary_key, label, normalized_label, sort_order, enabled)
VALUES
  ('asset_warehouse', '配件仓', '配件仓', 10, 1),
  ('asset_warehouse', '电脑仓', '电脑仓', 20, 1),
  ('asset_warehouse', '显示器仓', '显示器仓', 30, 1);
