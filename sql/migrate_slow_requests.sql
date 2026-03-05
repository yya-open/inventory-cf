-- Slow request logging table (best-effort)

CREATE TABLE IF NOT EXISTS api_slow_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  method TEXT,
  path TEXT,
  query TEXT,
  status INTEGER,
  dur_ms INTEGER,
  auth_ms INTEGER,
  sql_ms INTEGER,
  colo TEXT,
  country TEXT,
  user_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_api_slow_requests_created_at ON api_slow_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_api_slow_requests_path ON api_slow_requests(path);
CREATE INDEX IF NOT EXISTS idx_api_slow_requests_dur ON api_slow_requests(dur_ms);
