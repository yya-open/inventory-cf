ALTER TABLE users ADD COLUMN data_scope_type TEXT;
ALTER TABLE users ADD COLUMN data_scope_value TEXT;
UPDATE users SET data_scope_type='all' WHERE COALESCE(TRIM(data_scope_type), '')='';
UPDATE users SET data_scope_value=NULL WHERE TRIM(COALESCE(data_scope_type, 'all'))<>'department';
CREATE INDEX IF NOT EXISTS idx_users_data_scope_type_value ON users(data_scope_type, data_scope_value);

ALTER TABLE backup_drill_runs ADD COLUMN issue_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE backup_drill_runs ADD COLUMN follow_up_status TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE backup_drill_runs ADD COLUMN rect_owner TEXT;
ALTER TABLE backup_drill_runs ADD COLUMN rect_due_at TEXT;
ALTER TABLE backup_drill_runs ADD COLUMN rect_closed_at TEXT;
ALTER TABLE backup_drill_runs ADD COLUMN review_note TEXT;
ALTER TABLE backup_drill_runs ADD COLUMN updated_at TEXT;
UPDATE backup_drill_runs SET updated_at=COALESCE(updated_at, created_at, drill_at, datetime('now','+8 hours'));
CREATE INDEX IF NOT EXISTS idx_backup_drill_runs_follow_up_status ON backup_drill_runs(follow_up_status, rect_due_at, id DESC);
