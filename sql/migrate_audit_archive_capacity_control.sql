-- audit log archive policy, storage stats cache, and archive run history

CREATE TABLE IF NOT EXISTS audit_retention_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  retention_days INTEGER NOT NULL DEFAULT 180,
  last_cleanup_at TEXT
);

INSERT OR IGNORE INTO audit_retention_state (id, retention_days, last_cleanup_at)
VALUES (1, 180, NULL);

ALTER TABLE audit_retention_state ADD COLUMN archive_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_retention_state ADD COLUMN archive_after_days INTEGER NOT NULL DEFAULT 90;
ALTER TABLE audit_retention_state ADD COLUMN delete_after_archive INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_retention_state ADD COLUMN max_archive_rows INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE audit_retention_state ADD COLUMN warn_db_size_mb INTEGER NOT NULL DEFAULT 350;
ALTER TABLE audit_retention_state ADD COLUMN warn_audit_rows INTEGER NOT NULL DEFAULT 200000;
ALTER TABLE audit_retention_state ADD COLUMN warn_audit_bytes_mb INTEGER NOT NULL DEFAULT 128;
ALTER TABLE audit_retention_state ADD COLUMN last_archive_at TEXT;
ALTER TABLE audit_retention_state ADD COLUMN last_archive_before TEXT;
ALTER TABLE audit_retention_state ADD COLUMN last_archive_deleted_rows INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_retention_state ADD COLUMN stats_updated_at TEXT;
ALTER TABLE audit_retention_state ADD COLUMN stats_total_rows INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_retention_state ADD COLUMN stats_eligible_rows INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_retention_state ADD COLUMN stats_approx_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_retention_state ADD COLUMN stats_eligible_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_retention_state ADD COLUMN stats_oldest_at TEXT;
ALTER TABLE audit_retention_state ADD COLUMN stats_newest_at TEXT;
ALTER TABLE audit_retention_state ADD COLUMN stats_db_size_bytes INTEGER NOT NULL DEFAULT 0;

UPDATE audit_retention_state
SET archive_enabled = COALESCE(archive_enabled, 0),
    archive_after_days = COALESCE(archive_after_days, 90),
    delete_after_archive = COALESCE(delete_after_archive, 0),
    max_archive_rows = COALESCE(max_archive_rows, 5000),
    warn_db_size_mb = COALESCE(warn_db_size_mb, 350),
    warn_audit_rows = COALESCE(warn_audit_rows, 200000),
    warn_audit_bytes_mb = COALESCE(warn_audit_bytes_mb, 128),
    last_archive_deleted_rows = COALESCE(last_archive_deleted_rows, 0),
    stats_total_rows = COALESCE(stats_total_rows, 0),
    stats_eligible_rows = COALESCE(stats_eligible_rows, 0),
    stats_approx_bytes = COALESCE(stats_approx_bytes, 0),
    stats_eligible_bytes = COALESCE(stats_eligible_bytes, 0),
    stats_db_size_bytes = COALESCE(stats_db_size_bytes, 0)
WHERE id = 1;

CREATE TABLE IF NOT EXISTS audit_archive_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  archive_before TEXT NOT NULL,
  exported_rows INTEGER NOT NULL DEFAULT 0,
  deleted_rows INTEGER NOT NULL DEFAULT 0,
  result_object_key TEXT,
  result_filename TEXT,
  result_file_size INTEGER,
  content_type TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_audit_archive_runs_created_at ON audit_archive_runs(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_archive_runs_job_id ON audit_archive_runs(job_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_id ON audit_log(created_at, id);
