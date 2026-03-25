CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
ON schema_migrations(applied_at);

INSERT OR REPLACE INTO schema_migrations (id, name, checksum, applied_at)
VALUES (
  '202603250010_async_job_result_size_bytes',
  'sql/migrate_async_job_result_size_bytes.sql',
  'b55ed3c2e53a073cf7774f1179cf3fbaae0f1835ad3706351c990ff255ceae09',
  datetime('now','+8 hours')
);