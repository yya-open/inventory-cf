CREATE TABLE IF NOT EXISTS admin_repair_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_key TEXT NOT NULL,
  action_label TEXT NOT NULL,
  actor_id INTEGER,
  actor_name TEXT,
  before_problem_count INTEGER NOT NULL DEFAULT 0,
  before_affected_rows INTEGER NOT NULL DEFAULT 0,
  repaired_count INTEGER NOT NULL DEFAULT 0,
  after_problem_count INTEGER NOT NULL DEFAULT 0,
  after_affected_rows INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 1,
  result_summary TEXT,
  detail_json TEXT,
  error_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_admin_repair_history_created_at ON admin_repair_history(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_repair_history_action_key ON admin_repair_history(action_key, id DESC);
