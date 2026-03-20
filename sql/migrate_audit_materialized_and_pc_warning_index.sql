PRAGMA foreign_keys = OFF;

CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_mfg_status_id ON pc_assets(archived, manufacture_date, status, id);

DROP TABLE IF EXISTS audit_log__mat_new;
CREATE TABLE audit_log__mat_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  payload_json TEXT,
  ip TEXT,
  ua TEXT,
  module_code TEXT,
  high_risk INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

INSERT INTO audit_log__mat_new (
  id, user_id, username, action, entity, entity_id, payload_json, ip, ua, module_code, high_risk, created_at
)
SELECT
  id,
  user_id,
  username,
  action,
  entity,
  entity_id,
  payload_json,
  ip,
  ua,
  CASE
    WHEN UPPER(COALESCE(action, '')) LIKE 'STOCKTAKE%' OR LOWER(COALESCE(entity, '')) LIKE '%stocktake%' THEN 'STOCKTAKE'
    WHEN UPPER(COALESCE(action, '')) LIKE 'STOCK_%' OR LOWER(COALESCE(entity, '')) IN ('stock', 'stock_tx') THEN 'STOCK'
    WHEN UPPER(COALESCE(action, '')) LIKE 'ITEM_%' OR LOWER(COALESCE(entity, '')) = 'items' THEN 'ITEM'
    WHEN UPPER(COALESCE(action, '')) LIKE 'USER_%' OR LOWER(COALESCE(entity, '')) = 'users' THEN 'USER'
    WHEN UPPER(COALESCE(action, '')) LIKE 'AUDIT_%' OR LOWER(COALESCE(entity, '')) = 'audit_log' THEN 'AUDIT'
    WHEN UPPER(COALESCE(action, '')) LIKE 'ADMIN_%' OR LOWER(COALESCE(entity, '')) IN ('restore_job', 'backup', 'schema') THEN 'ADMIN'
    WHEN UPPER(COALESCE(action, '')) LIKE 'PC_%' OR LOWER(COALESCE(entity, '')) LIKE 'pc_%' THEN 'PC'
    WHEN UPPER(COALESCE(action, '')) LIKE 'MONITOR_%' OR LOWER(COALESCE(entity, '')) LIKE 'monitor_%' THEN 'MONITOR'
    ELSE 'OTHER'
  END AS module_code,
  CASE
    WHEN INSTR(UPPER(COALESCE(action, '')), 'DELETE') > 0
      OR INSTR(UPPER(COALESCE(action, '')), 'ARCHIVE') > 0
      OR INSTR(UPPER(COALESCE(action, '')), 'SCRAP') > 0
      OR INSTR(UPPER(COALESCE(action, '')), 'ROLLBACK') > 0
      OR INSTR(UPPER(COALESCE(action, '')), 'RESET_PASSWORD') > 0
      OR INSTR(UPPER(COALESCE(action, '')), 'RESTORE') > 0
      OR INSTR(UPPER(COALESCE(action, '')), 'CLEAR') > 0
    THEN 1 ELSE 0
  END AS high_risk,
  created_at
FROM audit_log;

DROP TABLE audit_log;
ALTER TABLE audit_log__mat_new RENAME TO audit_log;

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_created_at ON audit_log(action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_username_created_at ON audit_log(username, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_module_created_at ON audit_log(module_code, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_high_risk_created_at ON audit_log(high_risk, created_at);

DELETE FROM sqlite_sequence WHERE name = 'audit_log';
INSERT INTO sqlite_sequence(name, seq)
VALUES('audit_log', COALESCE((SELECT MAX(id) FROM audit_log), 0));

PRAGMA foreign_keys = ON;
