CREATE TABLE IF NOT EXISTS observability_retention_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  slow_request_days INTEGER NOT NULL DEFAULT 30,
  request_error_days INTEGER NOT NULL DEFAULT 30,
  browser_perf_days INTEGER NOT NULL DEFAULT 14,
  browser_event_days INTEGER NOT NULL DEFAULT 14,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

INSERT INTO observability_retention_policy (id, slow_request_days, request_error_days, browser_perf_days, browser_event_days, updated_at)
VALUES (1, 30, 30, 14, 14, datetime('now','+8 hours'))
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS observability_cleanup_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_reason TEXT NOT NULL DEFAULT 'manual',
  deleted_slow_request_rows INTEGER NOT NULL DEFAULT 0,
  deleted_request_error_rows INTEGER NOT NULL DEFAULT 0,
  deleted_browser_perf_rows INTEGER NOT NULL DEFAULT 0,
  deleted_browser_event_rows INTEGER NOT NULL DEFAULT 0,
  policy_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_observability_cleanup_runs_created_at ON observability_cleanup_runs(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_asset_inventory_batch_kind_status_closed ON asset_inventory_batch(kind, status, closed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_pc_inventory_log_created_batch_action ON pc_inventory_log(created_at DESC, batch_id, action, id DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_inventory_log_created_batch_action ON monitor_inventory_log(created_at DESC, batch_id, action, id DESC);
CREATE INDEX IF NOT EXISTS idx_browser_perf_log_path_duration_created ON browser_perf_log(path, duration_ms DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_event_log_path_event_created ON browser_event_log(path, event_name, created_at DESC);
