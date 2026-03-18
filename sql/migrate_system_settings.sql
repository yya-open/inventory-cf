CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at ON system_settings(updated_at);
