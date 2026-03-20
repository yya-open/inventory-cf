-- Latest-state snapshot, audit materialized fields, normalized search columns,
-- persistent dictionary usage counters, and atomic settings meta row.

ALTER TABLE pc_assets ADD COLUMN search_text_norm TEXT;
UPDATE pc_assets
SET search_text_norm = LOWER(TRIM(
  COALESCE(serial_no, '') || ' ' ||
  COALESCE(brand, '') || ' ' ||
  COALESCE(model, '') || ' ' ||
  COALESCE(remark, '') || ' ' ||
  COALESCE(disk_capacity, '') || ' ' ||
  COALESCE(memory_size, '')
))
WHERE COALESCE(search_text_norm, '') = '';
CREATE INDEX IF NOT EXISTS idx_pc_assets_search_text_norm ON pc_assets(search_text_norm);

CREATE TABLE IF NOT EXISTS pc_asset_latest_state (
  asset_id INTEGER PRIMARY KEY,
  last_out_id INTEGER,
  last_in_id INTEGER,
  last_recycle_id INTEGER,
  current_employee_no TEXT,
  current_employee_name TEXT,
  current_department TEXT,
  last_config_date TEXT,
  last_out_at TEXT,
  last_in_at TEXT,
  last_recycle_date TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE,
  FOREIGN KEY(last_out_id) REFERENCES pc_out(id) ON DELETE SET NULL,
  FOREIGN KEY(last_in_id) REFERENCES pc_in(id) ON DELETE SET NULL,
  FOREIGN KEY(last_recycle_id) REFERENCES pc_recycle(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_pc_asset_latest_state_current_department ON pc_asset_latest_state(current_department, asset_id);
DELETE FROM pc_asset_latest_state;
INSERT INTO pc_asset_latest_state (
  asset_id, last_out_id, last_in_id, last_recycle_id,
  current_employee_no, current_employee_name, current_department,
  last_config_date, last_out_at, last_in_at, last_recycle_date, updated_at
)
SELECT
  a.id,
  lo.id,
  li.id,
  lr.id,
  CASE WHEN a.status='ASSIGNED' THEN lo.employee_no ELSE NULL END,
  CASE WHEN a.status='ASSIGNED' THEN lo.employee_name ELSE NULL END,
  CASE WHEN a.status='ASSIGNED' THEN lo.department ELSE NULL END,
  lo.config_date,
  lo.created_at,
  li.created_at,
  lr.recycle_date,
  datetime('now','+8 hours')
FROM pc_assets a
LEFT JOIN pc_out lo ON lo.id = (SELECT id FROM pc_out WHERE asset_id=a.id ORDER BY id DESC LIMIT 1)
LEFT JOIN pc_in li ON li.id = (SELECT id FROM pc_in WHERE asset_id=a.id ORDER BY id DESC LIMIT 1)
LEFT JOIN pc_recycle lr ON lr.id = (SELECT id FROM pc_recycle WHERE asset_id=a.id ORDER BY id DESC LIMIT 1);

ALTER TABLE monitor_assets ADD COLUMN search_text_norm TEXT;
UPDATE monitor_assets
SET search_text_norm = LOWER(TRIM(
  COALESCE(asset_code, '') || ' ' ||
  COALESCE(sn, '') || ' ' ||
  COALESCE(brand, '') || ' ' ||
  COALESCE(model, '') || ' ' ||
  COALESCE(remark, '') || ' ' ||
  COALESCE(employee_no, '') || ' ' ||
  COALESCE(employee_name, '') || ' ' ||
  COALESCE(department, '')
))
WHERE COALESCE(search_text_norm, '') = '';
CREATE INDEX IF NOT EXISTS idx_monitor_assets_search_text_norm ON monitor_assets(search_text_norm);

ALTER TABLE audit_log ADD COLUMN target_name TEXT;
ALTER TABLE audit_log ADD COLUMN target_code TEXT;
ALTER TABLE audit_log ADD COLUMN summary_text TEXT;
ALTER TABLE audit_log ADD COLUMN search_text_norm TEXT;
UPDATE audit_log
SET target_name = COALESCE(
      json_extract(payload_json, '$.target_name'),
      json_extract(payload_json, '$.item_name'),
      json_extract(payload_json, '$.user_name'),
      json_extract(payload_json, '$.after.name'),
      json_extract(payload_json, '$.after.username'),
      json_extract(payload_json, '$.after.employee_name'),
      json_extract(payload_json, '$.name'),
      json_extract(payload_json, '$.username')
    ),
    target_code = COALESCE(
      json_extract(payload_json, '$.target_code'),
      json_extract(payload_json, '$.after.asset_code'),
      json_extract(payload_json, '$.after.serial_no'),
      json_extract(payload_json, '$.asset_code'),
      json_extract(payload_json, '$.serial_no'),
      json_extract(payload_json, '$.tx_no'),
      json_extract(payload_json, '$.out_no'),
      json_extract(payload_json, '$.in_no'),
      json_extract(payload_json, '$.recycle_no'),
      json_extract(payload_json, '$.scrap_no'),
      entity_id
    ),
    summary_text = COALESCE(
      json_extract(payload_json, '$.summary_text'),
      json_extract(payload_json, '$.summary'),
      json_extract(payload_json, '$.reason'),
      json_extract(payload_json, '$.message')
    )
WHERE target_name IS NULL OR target_code IS NULL OR summary_text IS NULL;
UPDATE audit_log
SET search_text_norm = LOWER(TRIM(
  COALESCE(action, '') || ' ' ||
  COALESCE(entity, '') || ' ' ||
  COALESCE(entity_id, '') || ' ' ||
  COALESCE(username, '') || ' ' ||
  COALESCE(target_name, '') || ' ' ||
  COALESCE(target_code, '') || ' ' ||
  COALESCE(summary_text, '')
))
WHERE COALESCE(search_text_norm, '') = '';
CREATE INDEX IF NOT EXISTS idx_audit_log_target_code_created_at ON audit_log(target_code, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_search_text_norm ON audit_log(search_text_norm);

CREATE TABLE IF NOT EXISTS dictionary_usage_counters (
  dictionary_key TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  label TEXT NOT NULL,
  reference_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  PRIMARY KEY (dictionary_key, normalized_label)
);
CREATE INDEX IF NOT EXISTS idx_dictionary_usage_counters_key_count ON dictionary_usage_counters(dictionary_key, reference_count DESC, normalized_label ASC);
DELETE FROM dictionary_usage_counters;
INSERT INTO dictionary_usage_counters (dictionary_key, normalized_label, label, reference_count, updated_at)
SELECT 'pc_brand', LOWER(TRIM(label)), label, c, datetime('now','+8 hours')
FROM (
  SELECT TRIM(COALESCE(brand, '')) AS label, COUNT(*) AS c FROM pc_assets GROUP BY TRIM(COALESCE(brand, ''))
) t WHERE TRIM(label) <> '';
INSERT INTO dictionary_usage_counters (dictionary_key, normalized_label, label, reference_count, updated_at)
SELECT 'monitor_brand', LOWER(TRIM(label)), label, c, datetime('now','+8 hours')
FROM (
  SELECT TRIM(COALESCE(brand, '')) AS label, COUNT(*) AS c FROM monitor_assets GROUP BY TRIM(COALESCE(brand, ''))
) t WHERE TRIM(label) <> '';
INSERT INTO dictionary_usage_counters (dictionary_key, normalized_label, label, reference_count, updated_at)
SELECT 'asset_archive_reason', LOWER(TRIM(label)), label, c, datetime('now','+8 hours')
FROM (
  SELECT label, SUM(c) AS c FROM (
    SELECT TRIM(COALESCE(archived_reason, '')) AS label, COUNT(*) AS c FROM pc_assets WHERE archived=1 GROUP BY TRIM(COALESCE(archived_reason, ''))
    UNION ALL
    SELECT TRIM(COALESCE(archived_reason, '')) AS label, COUNT(*) AS c FROM monitor_assets WHERE archived=1 GROUP BY TRIM(COALESCE(archived_reason, ''))
  ) q GROUP BY label
) t WHERE TRIM(label) <> '';
INSERT INTO dictionary_usage_counters (dictionary_key, normalized_label, label, reference_count, updated_at)
SELECT 'department', LOWER(TRIM(label)), label, c, datetime('now','+8 hours')
FROM (
  SELECT label, SUM(c) AS c FROM (
    SELECT TRIM(COALESCE(current_department, '')) AS label, COUNT(*) AS c FROM pc_asset_latest_state GROUP BY TRIM(COALESCE(current_department, ''))
    UNION ALL
    SELECT TRIM(COALESCE(department, '')) AS label, COUNT(*) AS c FROM monitor_assets GROUP BY TRIM(COALESCE(department, ''))
  ) q GROUP BY label
) t WHERE TRIM(label) <> '';

CREATE TABLE IF NOT EXISTS system_settings_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_by TEXT
);
INSERT OR IGNORE INTO system_settings_meta (id, version, settings_json, updated_at)
VALUES (1, 0, '{}', COALESCE((SELECT MAX(updated_at) FROM system_settings), datetime('now','+8 hours')));
