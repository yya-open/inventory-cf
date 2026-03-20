CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL,
  permission_code TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_by TEXT,
  PRIMARY KEY (user_id, permission_code),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_permissions_code_user ON user_permissions(permission_code, user_id);

CREATE TABLE IF NOT EXISTS async_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_by INTEGER,
  created_by_name TEXT,
  permission_scope TEXT,
  request_json TEXT,
  result_text TEXT,
  result_content_type TEXT,
  result_filename TEXT,
  message TEXT,
  error_text TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
CREATE INDEX IF NOT EXISTS idx_async_jobs_status_created_at ON async_jobs(status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS request_error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT,
  path TEXT,
  status INTEGER,
  total_ms INTEGER,
  sql_ms INTEGER,
  auth_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
CREATE INDEX IF NOT EXISTS idx_request_error_log_created_at ON request_error_log(created_at DESC, id DESC);
