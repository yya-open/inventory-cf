-- Restore job tables (task-based restore with progress/resume/cancel)
CREATE TABLE IF NOT EXISTS restore_job (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,            -- QUEUED / RUNNING / DONE / CANCELED / FAILED
  stage TEXT NOT NULL,             -- SCAN / RESTORE
  mode TEXT NOT NULL,              -- merge / replace
  file_key TEXT NOT NULL,          -- R2 object key
  filename TEXT,
  created_by TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  current_table TEXT,
  cursor_json TEXT NOT NULL DEFAULT '{}',
  per_table_json TEXT NOT NULL DEFAULT '{}',
  replaced_done INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_restore_job_status ON restore_job(status);
