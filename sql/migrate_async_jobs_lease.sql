ALTER TABLE async_jobs ADD COLUMN worker_token TEXT;
ALTER TABLE async_jobs ADD COLUMN lease_until TEXT;
CREATE INDEX IF NOT EXISTS idx_async_jobs_job_type_status_created_at ON async_jobs(job_type, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_async_jobs_created_by_job_type_status ON async_jobs(created_by, job_type, status, created_at DESC, id DESC);
