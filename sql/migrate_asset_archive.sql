ALTER TABLE pc_assets ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pc_assets ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_status ON pc_assets(archived, status, id);

ALTER TABLE monitor_assets ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monitor_assets ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_status ON monitor_assets(archived, status, id);
