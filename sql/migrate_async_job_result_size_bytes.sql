ALTER TABLE async_jobs ADD COLUMN result_size_bytes INTEGER NOT NULL DEFAULT 0;
UPDATE async_jobs
SET result_size_bytes = CASE
  WHEN result_text IS NULL THEN 0
  ELSE length(CAST(result_text AS BLOB))
END
WHERE COALESCE(result_size_bytes, 0) = 0;
