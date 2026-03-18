ALTER TABLE pc_assets ADD COLUMN archived_reason TEXT;
ALTER TABLE pc_assets ADD COLUMN archived_note TEXT;
ALTER TABLE pc_assets ADD COLUMN archived_by TEXT;
ALTER TABLE monitor_assets ADD COLUMN archived_reason TEXT;
ALTER TABLE monitor_assets ADD COLUMN archived_note TEXT;
ALTER TABLE monitor_assets ADD COLUMN archived_by TEXT;
UPDATE pc_assets SET archived_reason=COALESCE(archived_reason,'历史归档') WHERE COALESCE(archived,0)=1 AND archived_reason IS NULL;
UPDATE monitor_assets SET archived_reason=COALESCE(archived_reason,'历史归档') WHERE COALESCE(archived,0)=1 AND archived_reason IS NULL;
