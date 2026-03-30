CREATE TABLE IF NOT EXISTS item_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
CREATE INDEX IF NOT EXISTS idx_item_categories_enabled_name ON item_categories(enabled, name);

ALTER TABLE items ADD COLUMN category_id INTEGER REFERENCES item_categories(id);

INSERT OR IGNORE INTO item_categories (name, enabled, created_at, updated_at)
SELECT DISTINCT TRIM(category), 1, datetime('now','+8 hours'), datetime('now','+8 hours')
FROM items
WHERE category IS NOT NULL AND TRIM(category) <> '';

UPDATE items
SET category_id = (
  SELECT c.id FROM item_categories c WHERE c.name = TRIM(items.category) LIMIT 1
)
WHERE category IS NOT NULL AND TRIM(category) <> '' AND category_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id);

ALTER TABLE pc_assets ADD COLUMN manufacture_ts INTEGER;
ALTER TABLE pc_assets ADD COLUMN warranty_end_ts INTEGER;

UPDATE pc_assets
SET manufacture_ts = CASE
      WHEN TRIM(COALESCE(manufacture_date, '')) = '' THEN NULL
      ELSE CAST(strftime('%s', TRIM(manufacture_date) || ' 00:00:00') AS INTEGER)
    END,
    warranty_end_ts = CASE
      WHEN TRIM(COALESCE(warranty_end, '')) = '' THEN NULL
      ELSE CAST(strftime('%s', TRIM(warranty_end) || ' 00:00:00') AS INTEGER)
    END;

DROP INDEX IF EXISTS idx_pc_assets_status;
DROP INDEX IF EXISTS idx_monitor_assets_status;
DROP INDEX IF EXISTS idx_pc_assets_archived_mfg_status_id;
CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_mfgts_status_id ON pc_assets(archived, manufacture_ts, status, id);
CREATE INDEX IF NOT EXISTS idx_pc_assets_warranty_ts_id ON pc_assets(warranty_end_ts, id);

DROP TRIGGER IF EXISTS pc_assets_ts_ai;
DROP TRIGGER IF EXISTS pc_assets_ts_au;
CREATE TRIGGER IF NOT EXISTS pc_assets_ts_ai AFTER INSERT ON pc_assets BEGIN
  UPDATE pc_assets
  SET manufacture_ts = CASE
        WHEN TRIM(COALESCE(new.manufacture_date, '')) = '' THEN NULL
        ELSE CAST(strftime('%s', TRIM(new.manufacture_date) || ' 00:00:00') AS INTEGER)
      END,
      warranty_end_ts = CASE
        WHEN TRIM(COALESCE(new.warranty_end, '')) = '' THEN NULL
        ELSE CAST(strftime('%s', TRIM(new.warranty_end) || ' 00:00:00') AS INTEGER)
      END
  WHERE id = new.id;
END;
CREATE TRIGGER IF NOT EXISTS pc_assets_ts_au AFTER UPDATE OF manufacture_date, warranty_end ON pc_assets BEGIN
  UPDATE pc_assets
  SET manufacture_ts = CASE
        WHEN TRIM(COALESCE(new.manufacture_date, '')) = '' THEN NULL
        ELSE CAST(strftime('%s', TRIM(new.manufacture_date) || ' 00:00:00') AS INTEGER)
      END,
      warranty_end_ts = CASE
        WHEN TRIM(COALESCE(new.warranty_end, '')) = '' THEN NULL
        ELSE CAST(strftime('%s', TRIM(new.warranty_end) || ' 00:00:00') AS INTEGER)
      END
  WHERE id = new.id;
END;

CREATE TABLE IF NOT EXISTS slow_request_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT,
  path TEXT,
  status INTEGER,
  total_ms INTEGER,
  sql_ms INTEGER,
  auth_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now','+8 hours'))
);
CREATE TABLE IF NOT EXISTS request_error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT,
  path TEXT,
  status INTEGER,
  total_ms INTEGER,
  sql_ms INTEGER,
  auth_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now','+8 hours'))
);
CREATE INDEX IF NOT EXISTS idx_slow_request_log_created_path ON slow_request_log(created_at DESC, path, status);
CREATE INDEX IF NOT EXISTS idx_request_error_log_created_status ON request_error_log(created_at DESC, status, path);
