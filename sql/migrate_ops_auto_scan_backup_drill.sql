CREATE TABLE IF NOT EXISTS ops_scan_state (
  scan_key TEXT PRIMARY KEY,
  total_problem_count INTEGER NOT NULL DEFAULT 0,
  affected_rows INTEGER NOT NULL DEFAULT 0,
  scan_json TEXT,
  last_scan_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_ops_scan_state_updated_at
ON ops_scan_state(updated_at DESC);

CREATE TABLE IF NOT EXISTS backup_drill_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drill_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  outcome TEXT NOT NULL DEFAULT 'success',
  scenario TEXT,
  operator_id INTEGER,
  operator_name TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_backup_drill_runs_drill_at
ON backup_drill_runs(drill_at DESC, id DESC);
