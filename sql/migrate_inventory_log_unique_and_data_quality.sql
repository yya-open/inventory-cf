-- Keep the latest historic entry before enforcing a single result per asset and inventory batch.
DELETE FROM pc_inventory_log
WHERE batch_id IS NOT NULL
  AND id NOT IN (
    SELECT MAX(id)
    FROM pc_inventory_log
    WHERE batch_id IS NOT NULL
    GROUP BY batch_id, asset_id
  );

DELETE FROM monitor_inventory_log
WHERE batch_id IS NOT NULL
  AND id NOT IN (
    SELECT MAX(id)
    FROM monitor_inventory_log
    WHERE batch_id IS NOT NULL
    GROUP BY batch_id, asset_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_pc_inventory_log_batch_asset
  ON pc_inventory_log(batch_id, asset_id)
  WHERE batch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_monitor_inventory_log_batch_asset
  ON monitor_inventory_log(batch_id, asset_id)
  WHERE batch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS data_quality_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_key TEXT NOT NULL UNIQUE,
  severity TEXT NOT NULL CHECK(severity IN ('error', 'warn')),
  source_table TEXT,
  title TEXT NOT NULL,
  detail TEXT,
  affected_count INTEGER NOT NULL DEFAULT 0,
  sample_json TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'ignored', 'resolved')),
  owner TEXT,
  due_at TEXT,
  note TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  resolved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_data_quality_cases_status_severity_seen
  ON data_quality_cases(status, severity, last_seen_at DESC, id DESC);
