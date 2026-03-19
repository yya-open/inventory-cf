PRAGMA foreign_keys = OFF;

CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_reason_id ON pc_assets(archived, archived_reason, id);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_reason_id ON monitor_assets(archived, archived_reason, id);

CREATE TABLE IF NOT EXISTS pc_inventory_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  issue_type TEXT,
  remark TEXT,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pc_recycle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recycle_no TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK(action IN ('RETURN','RECYCLE')),
  asset_id INTEGER NOT NULL,
  employee_no TEXT,
  department TEXT,
  employee_name TEXT,
  is_employed TEXT,
  brand TEXT NOT NULL,
  serial_no TEXT NOT NULL,
  model TEXT NOT NULL,
  recycle_date TEXT NOT NULL,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  created_by TEXT,
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id)
);

CREATE TABLE IF NOT EXISTS monitor_inventory_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('OK','ISSUE')),
  issue_type TEXT,
  remark TEXT,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  FOREIGN KEY(asset_id) REFERENCES monitor_assets(id)
);

DROP TABLE IF EXISTS pc_in__cascade_new;
CREATE TABLE pc_in__cascade_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  in_no TEXT NOT NULL UNIQUE,
  asset_id INTEGER NOT NULL,
  brand TEXT NOT NULL,
  serial_no TEXT NOT NULL,
  model TEXT NOT NULL,
  manufacture_date TEXT,
  warranty_end TEXT,
  disk_capacity TEXT,
  memory_size TEXT,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  created_by TEXT,
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
);
INSERT INTO pc_in__cascade_new SELECT * FROM pc_in;
DROP TABLE pc_in;
ALTER TABLE pc_in__cascade_new RENAME TO pc_in;
CREATE INDEX IF NOT EXISTS idx_pc_in_created_at ON pc_in(created_at);
CREATE INDEX IF NOT EXISTS idx_pc_in_serial ON pc_in(serial_no);
CREATE INDEX IF NOT EXISTS idx_pc_in_no ON pc_in(in_no);
CREATE INDEX IF NOT EXISTS idx_pc_in_asset_id_id ON pc_in(asset_id, id DESC);

DROP TABLE IF EXISTS pc_out__cascade_new;
CREATE TABLE pc_out__cascade_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  out_no TEXT NOT NULL UNIQUE,
  asset_id INTEGER NOT NULL,
  employee_no TEXT NOT NULL,
  department TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  is_employed TEXT,
  brand TEXT NOT NULL,
  serial_no TEXT NOT NULL,
  model TEXT NOT NULL,
  config_date TEXT,
  manufacture_date TEXT,
  warranty_end TEXT,
  disk_capacity TEXT,
  memory_size TEXT,
  remark TEXT,
  recycle_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  created_by TEXT,
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
);
INSERT INTO pc_out__cascade_new SELECT * FROM pc_out;
DROP TABLE pc_out;
ALTER TABLE pc_out__cascade_new RENAME TO pc_out;
CREATE INDEX IF NOT EXISTS idx_pc_out_created_at ON pc_out(created_at);
CREATE INDEX IF NOT EXISTS idx_pc_out_serial ON pc_out(serial_no);
CREATE INDEX IF NOT EXISTS idx_pc_out_employee ON pc_out(employee_no);
CREATE INDEX IF NOT EXISTS idx_pc_out_no ON pc_out(out_no);
CREATE INDEX IF NOT EXISTS idx_pc_out_asset_id_id ON pc_out(asset_id, id DESC);

DROP TABLE IF EXISTS pc_recycle__cascade_new;
CREATE TABLE pc_recycle__cascade_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recycle_no TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK(action IN ('RETURN','RECYCLE')),
  asset_id INTEGER NOT NULL,
  employee_no TEXT,
  department TEXT,
  employee_name TEXT,
  is_employed TEXT,
  brand TEXT NOT NULL,
  serial_no TEXT NOT NULL,
  model TEXT NOT NULL,
  recycle_date TEXT NOT NULL,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  created_by TEXT,
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
);
INSERT INTO pc_recycle__cascade_new SELECT * FROM pc_recycle;
DROP TABLE pc_recycle;
ALTER TABLE pc_recycle__cascade_new RENAME TO pc_recycle;
CREATE INDEX IF NOT EXISTS idx_pc_recycle_created_at ON pc_recycle(created_at);
CREATE INDEX IF NOT EXISTS idx_pc_recycle_serial ON pc_recycle(serial_no);
CREATE INDEX IF NOT EXISTS idx_pc_recycle_employee ON pc_recycle(employee_no);
CREATE INDEX IF NOT EXISTS idx_pc_recycle_no ON pc_recycle(recycle_no);
CREATE INDEX IF NOT EXISTS idx_pc_recycle_asset_id_id ON pc_recycle(asset_id, id DESC);

DROP TABLE IF EXISTS pc_scrap__cascade_new;
CREATE TABLE pc_scrap__cascade_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scrap_no TEXT NOT NULL,
  asset_id INTEGER NOT NULL,
  brand TEXT NOT NULL,
  serial_no TEXT NOT NULL,
  model TEXT NOT NULL,
  manufacture_date TEXT,
  warranty_end TEXT,
  disk_capacity TEXT,
  memory_size TEXT,
  remark TEXT,
  scrap_date TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  created_by TEXT,
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
);
INSERT INTO pc_scrap__cascade_new SELECT * FROM pc_scrap;
DROP TABLE pc_scrap;
ALTER TABLE pc_scrap__cascade_new RENAME TO pc_scrap;
CREATE INDEX IF NOT EXISTS idx_pc_scrap_no ON pc_scrap(scrap_no);
CREATE INDEX IF NOT EXISTS idx_pc_scrap_asset ON pc_scrap(asset_id);
CREATE INDEX IF NOT EXISTS idx_pc_scrap_asset_created_at ON pc_scrap(asset_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pc_scrap_created_at ON pc_scrap(created_at);

DROP TABLE IF EXISTS pc_inventory_log__cascade_new;
CREATE TABLE pc_inventory_log__cascade_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  issue_type TEXT,
  remark TEXT,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
);
INSERT INTO pc_inventory_log__cascade_new SELECT * FROM pc_inventory_log;
DROP TABLE pc_inventory_log;
ALTER TABLE pc_inventory_log__cascade_new RENAME TO pc_inventory_log;
CREATE INDEX IF NOT EXISTS idx_pc_inventory_log_asset_id_created_at ON pc_inventory_log(asset_id, created_at);

DROP TABLE IF EXISTS monitor_tx__cascade_new;
CREATE TABLE monitor_tx__cascade_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_no TEXT NOT NULL UNIQUE,
  tx_type TEXT NOT NULL CHECK(tx_type IN ('IN','OUT','RETURN','TRANSFER','SCRAP','ADJUST')),
  asset_id INTEGER NOT NULL,
  asset_code TEXT NOT NULL,
  sn TEXT,
  brand TEXT,
  model TEXT,
  size_inch TEXT,
  from_location_id INTEGER,
  to_location_id INTEGER,
  employee_no TEXT,
  department TEXT,
  employee_name TEXT,
  is_employed TEXT,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  created_by TEXT,
  ip TEXT,
  ua TEXT,
  FOREIGN KEY(asset_id) REFERENCES monitor_assets(id) ON DELETE CASCADE,
  FOREIGN KEY(from_location_id) REFERENCES pc_locations(id),
  FOREIGN KEY(to_location_id) REFERENCES pc_locations(id)
);
INSERT INTO monitor_tx__cascade_new SELECT * FROM monitor_tx;
DROP TABLE monitor_tx;
ALTER TABLE monitor_tx__cascade_new RENAME TO monitor_tx;
CREATE INDEX IF NOT EXISTS idx_monitor_tx_created_at ON monitor_tx(created_at);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_asset_id ON monitor_tx(asset_id);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_type ON monitor_tx(tx_type);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_type_created_at ON monitor_tx(tx_type, created_at);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_asset_type_created_at ON monitor_tx(asset_id, tx_type, created_at);

DROP TABLE IF EXISTS monitor_inventory_log__cascade_new;
CREATE TABLE monitor_inventory_log__cascade_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('OK','ISSUE')),
  issue_type TEXT,
  remark TEXT,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  FOREIGN KEY(asset_id) REFERENCES monitor_assets(id) ON DELETE CASCADE
);
INSERT INTO monitor_inventory_log__cascade_new SELECT * FROM monitor_inventory_log;
DROP TABLE monitor_inventory_log;
ALTER TABLE monitor_inventory_log__cascade_new RENAME TO monitor_inventory_log;
CREATE INDEX IF NOT EXISTS idx_monitor_inventory_log_asset_id_created_at ON monitor_inventory_log(asset_id, created_at);

DELETE FROM sqlite_sequence WHERE name IN (
  'pc_in',
  'pc_out',
  'pc_recycle',
  'pc_scrap',
  'pc_inventory_log',
  'monitor_tx',
  'monitor_inventory_log'
);
INSERT INTO sqlite_sequence(name, seq) VALUES
  ('pc_in', COALESCE((SELECT MAX(id) FROM pc_in), 0)),
  ('pc_out', COALESCE((SELECT MAX(id) FROM pc_out), 0)),
  ('pc_recycle', COALESCE((SELECT MAX(id) FROM pc_recycle), 0)),
  ('pc_scrap', COALESCE((SELECT MAX(id) FROM pc_scrap), 0)),
  ('pc_inventory_log', COALESCE((SELECT MAX(id) FROM pc_inventory_log), 0)),
  ('monitor_tx', COALESCE((SELECT MAX(id) FROM monitor_tx), 0)),
  ('monitor_inventory_log', COALESCE((SELECT MAX(id) FROM monitor_inventory_log), 0));

PRAGMA foreign_keys = ON;
