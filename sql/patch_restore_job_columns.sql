ALTER TABLE restore_job ADD COLUMN backup_version TEXT;
ALTER TABLE restore_job ADD COLUMN integrity_status TEXT;
ALTER TABLE restore_job ADD COLUMN validation_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE restore_job ADD COLUMN verification_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_restore_job_integrity_status
ON restore_job(integrity_status);