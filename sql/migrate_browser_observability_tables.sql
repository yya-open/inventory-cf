CREATE TABLE IF NOT EXISTS browser_perf_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'route',
  path TEXT NOT NULL,
  full_path TEXT,
  duration_ms INTEGER NOT NULL,
  username TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE TABLE IF NOT EXISTS browser_event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  path TEXT NOT NULL,
  full_path TEXT,
  metadata_json TEXT,
  username TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_browser_perf_log_created_at ON browser_perf_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_perf_log_path_created_at ON browser_perf_log(path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_perf_log_duration_created_at ON browser_perf_log(duration_ms DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_event_log_created_at ON browser_event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_event_log_event_created_at ON browser_event_log(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_event_log_path_created_at ON browser_event_log(path, created_at DESC);
