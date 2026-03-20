ALTER TABLE users ADD COLUMN permission_template_code TEXT;
ALTER TABLE async_jobs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE async_jobs ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 1;
ALTER TABLE async_jobs ADD COLUMN cancel_requested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE async_jobs ADD COLUMN canceled_at TEXT;
ALTER TABLE async_jobs ADD COLUMN retain_until TEXT;
ALTER TABLE async_jobs ADD COLUMN result_deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_async_jobs_created_by_status ON async_jobs(created_by, status, id DESC);
CREATE INDEX IF NOT EXISTS idx_async_jobs_retain_until ON async_jobs(retain_until, id DESC);
