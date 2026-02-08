-- Audit retention policy state
-- This is optional because the runtime also self-heals, but running it keeps schema explicit.

CREATE TABLE IF NOT EXISTS audit_retention_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  retention_days INTEGER NOT NULL DEFAULT 180,
  last_cleanup_at TEXT
);

INSERT OR IGNORE INTO audit_retention_state (id, retention_days, last_cleanup_at)
VALUES (1, 180, NULL);
