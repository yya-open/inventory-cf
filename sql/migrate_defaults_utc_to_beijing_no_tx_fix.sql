-- D1 migration: convert all table DEFAULT datetime('now') (UTC) to Beijing time (UTC+8)
-- Generated from sqlite_master schema dump.
-- This script rebuilds tables (SQLite cannot ALTER COLUMN DEFAULT).
-- WARNING: If you have custom INDEX/TRIGGER objects defined separately, rebuild them after this migration.

PRAGMA foreign_keys=OFF;

-- === api_slow_requests ===
DROP TABLE IF EXISTS api_slow_requests__bjtmp;
CREATE TABLE api_slow_requests__bjtmp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  method TEXT,
  path TEXT,
  query TEXT,
  status INTEGER,
  dur_ms INTEGER,
  auth_ms INTEGER,
  sql_ms INTEGER,
  colo TEXT,
  country TEXT,
  user_id INTEGER
);
INSERT INTO api_slow_requests__bjtmp SELECT * FROM api_slow_requests;
DROP TABLE api_slow_requests;
ALTER TABLE api_slow_requests__bjtmp RENAME TO api_slow_requests;
DELETE FROM sqlite_sequence WHERE name='api_slow_requests';
INSERT INTO sqlite_sequence(name, seq)
VALUES('api_slow_requests', COALESCE((SELECT MAX(id) FROM api_slow_requests), 0));


-- === audit_log ===
DROP TABLE IF EXISTS audit_log__bjtmp;
CREATE TABLE audit_log__bjtmp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  payload_json TEXT,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
INSERT INTO audit_log__bjtmp SELECT * FROM audit_log;
DROP TABLE audit_log;
ALTER TABLE audit_log__bjtmp RENAME TO audit_log;
DELETE FROM sqlite_sequence WHERE name='audit_log';
INSERT INTO sqlite_sequence(name, seq)
VALUES('audit_log', COALESCE((SELECT MAX(id) FROM audit_log), 0));


-- === auth_login_throttle ===
DROP TABLE IF EXISTS auth_login_throttle__bjtmp;
CREATE TABLE auth_login_throttle__bjtmp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  username TEXT NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  first_fail_at TEXT,
  last_fail_at TEXT,
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  UNIQUE(ip, username)
);
INSERT INTO auth_login_throttle__bjtmp SELECT * FROM auth_login_throttle;
DROP TABLE auth_login_throttle;
ALTER TABLE auth_login_throttle__bjtmp RENAME TO auth_login_throttle;
DELETE FROM sqlite_sequence WHERE name='auth_login_throttle';
INSERT INTO sqlite_sequence(name, seq)
VALUES('auth_login_throttle', COALESCE((SELECT MAX(id) FROM auth_login_throttle), 0));


-- === items ===
DROP TABLE IF EXISTS items__bjtmp;
CREATE TABLE items__bjtmp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  category TEXT,
  unit TEXT NOT NULL DEFAULT '涓?,
  warning_qty INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
INSERT INTO items__bjtmp SELECT * FROM items;
DROP TABLE items;
ALTER TABLE items__bjtmp RENAME TO items;
DELETE FROM sqlite_sequence WHERE name='items';
INSERT INTO sqlite_sequence(name, seq)
VALUES('items', COALESCE((SELECT MAX(id) FROM items), 0));


-- === pc_assets ===
DROP TABLE IF EXISTS pc_assets__bjtmp;
CREATE TABLE "pc_assets" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  serial_no TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  manufacture_date TEXT,
  warranty_end TEXT,
  disk_capacity TEXT,
  memory_size TEXT,
  remark TEXT,
  status TEXT NOT NULL CHECK(status IN ('IN_STOCK','ASSIGNED','RECYCLED','SCRAPPED')) DEFAULT 'IN_STOCK',
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
, qr_key TEXT, qr_updated_at TEXT);
INSERT INTO pc_assets__bjtmp SELECT * FROM pc_assets;
DROP TABLE pc_assets;
ALTER TABLE pc_assets__bjtmp RENAME TO pc_assets;
DELETE FROM sqlite_sequence WHERE name='pc_assets';
INSERT INTO sqlite_sequence(name, seq)
VALUES('pc_assets', COALESCE((SELECT MAX(id) FROM pc_assets), 0));


-- === pc_in ===
DROP TABLE IF EXISTS pc_in__bjtmp;
CREATE TABLE pc_in__bjtmp (
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
      FOREIGN KEY(asset_id) REFERENCES pc_assets(id)
    );
INSERT INTO pc_in__bjtmp SELECT * FROM pc_in;
DROP TABLE pc_in;
ALTER TABLE pc_in__bjtmp RENAME TO pc_in;
DELETE FROM sqlite_sequence WHERE name='pc_in';
INSERT INTO sqlite_sequence(name, seq)
VALUES('pc_in', COALESCE((SELECT MAX(id) FROM pc_in), 0));


-- === pc_inventory_log ===
DROP TABLE IF EXISTS pc_inventory_log__bjtmp;
CREATE TABLE pc_inventory_log__bjtmp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  action TEXT NOT NULL, -- 'OK' | 'ISSUE'
  issue_type TEXT,      -- NOT_FOUND/WRONG_LOCATION/WRONG_QR/WRONG_STATUS/MISSING/OTHER
  remark TEXT,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
);
INSERT INTO pc_inventory_log__bjtmp SELECT * FROM pc_inventory_log;
DROP TABLE pc_inventory_log;
ALTER TABLE pc_inventory_log__bjtmp RENAME TO pc_inventory_log;
DELETE FROM sqlite_sequence WHERE name='pc_inventory_log';
INSERT INTO sqlite_sequence(name, seq)
VALUES('pc_inventory_log', COALESCE((SELECT MAX(id) FROM pc_inventory_log), 0));


-- === pc_out ===
DROP TABLE IF EXISTS pc_out__bjtmp;
CREATE TABLE pc_out__bjtmp (
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
      FOREIGN KEY(asset_id) REFERENCES pc_assets(id)
    );
INSERT INTO pc_out__bjtmp SELECT * FROM pc_out;
DROP TABLE pc_out;
ALTER TABLE pc_out__bjtmp RENAME TO pc_out;
DELETE FROM sqlite_sequence WHERE name='pc_out';
INSERT INTO sqlite_sequence(name, seq)
VALUES('pc_out', COALESCE((SELECT MAX(id) FROM pc_out), 0));


-- === pc_recycle ===
DROP TABLE IF EXISTS pc_recycle__bjtmp;
CREATE TABLE pc_recycle__bjtmp (
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
INSERT INTO pc_recycle__bjtmp SELECT * FROM pc_recycle;
DROP TABLE pc_recycle;
ALTER TABLE pc_recycle__bjtmp RENAME TO pc_recycle;
DELETE FROM sqlite_sequence WHERE name='pc_recycle';
INSERT INTO sqlite_sequence(name, seq)
VALUES('pc_recycle', COALESCE((SELECT MAX(id) FROM pc_recycle), 0));


-- === pc_scrap ===
DROP TABLE IF EXISTS pc_scrap__bjtmp;
CREATE TABLE pc_scrap__bjtmp (
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
    FOREIGN KEY(asset_id) REFERENCES pc_assets(id)
  );
INSERT INTO pc_scrap__bjtmp SELECT * FROM pc_scrap;
DROP TABLE pc_scrap;
ALTER TABLE pc_scrap__bjtmp RENAME TO pc_scrap;
DELETE FROM sqlite_sequence WHERE name='pc_scrap';
INSERT INTO sqlite_sequence(name, seq)
VALUES('pc_scrap', COALESCE((SELECT MAX(id) FROM pc_scrap), 0));


-- === public_api_throttle ===
DROP TABLE IF EXISTS public_api_throttle__bjtmp;
CREATE TABLE public_api_throttle__bjtmp (
  k TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
INSERT INTO public_api_throttle__bjtmp SELECT * FROM public_api_throttle;
DROP TABLE public_api_throttle;
ALTER TABLE public_api_throttle__bjtmp RENAME TO public_api_throttle;

-- === restore_job ===
DROP TABLE IF EXISTS restore_job__bjtmp;
CREATE TABLE restore_job__bjtmp (   id TEXT PRIMARY KEY,   status TEXT NOT NULL,   stage TEXT NOT NULL,   mode TEXT NOT NULL,   file_key TEXT NOT NULL,   filename TEXT,   created_by TEXT,   total_rows INTEGER NOT NULL DEFAULT 0,   processed_rows INTEGER NOT NULL DEFAULT 0,   current_table TEXT,   cursor_json TEXT NOT NULL DEFAULT '{}',   per_table_json TEXT NOT NULL DEFAULT '{}',   replaced_done INTEGER NOT NULL DEFAULT 0,   error_count INTEGER NOT NULL DEFAULT 0,   last_error TEXT,   created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),   updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')) );
INSERT INTO restore_job__bjtmp SELECT * FROM restore_job;
DROP TABLE restore_job;
ALTER TABLE restore_job__bjtmp RENAME TO restore_job;

-- === stock ===
DROP TABLE IF EXISTS stock__bjtmp;
CREATE TABLE stock__bjtmp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  UNIQUE(item_id, warehouse_id),
  FOREIGN KEY(item_id) REFERENCES items(id),
  FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);
INSERT INTO stock__bjtmp SELECT * FROM stock;
DROP TABLE stock;
ALTER TABLE stock__bjtmp RENAME TO stock;
DELETE FROM sqlite_sequence WHERE name='stock';
INSERT INTO sqlite_sequence(name, seq)
VALUES('stock', COALESCE((SELECT MAX(id) FROM stock), 0));


-- === stock_tx ===
DROP TABLE IF EXISTS stock_tx__bjtmp;
CREATE TABLE stock_tx__bjtmp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_no TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('IN','OUT','ADJUST','REVERSAL')),
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  unit_price REAL,
  source TEXT,
  target TEXT,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  created_by TEXT, delta_qty INTEGER NOT NULL DEFAULT 0, ref_type TEXT, ref_id INTEGER, ref_no TEXT,
  FOREIGN KEY(item_id) REFERENCES items(id),
  FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);
INSERT INTO stock_tx__bjtmp SELECT * FROM stock_tx;
DROP TABLE stock_tx;
ALTER TABLE stock_tx__bjtmp RENAME TO stock_tx;
DELETE FROM sqlite_sequence WHERE name='stock_tx';
INSERT INTO sqlite_sequence(name, seq)
VALUES('stock_tx', COALESCE((SELECT MAX(id) FROM stock_tx), 0));


-- === stocktake ===
DROP TABLE IF EXISTS stocktake__bjtmp;
CREATE TABLE "stocktake" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  st_no TEXT NOT NULL UNIQUE,
  warehouse_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('DRAFT','APPLYING','APPLIED','ROLLING')) DEFAULT 'DRAFT',
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  created_by TEXT,
  applied_at TEXT,
  FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);
INSERT INTO stocktake__bjtmp SELECT * FROM stocktake;
DROP TABLE stocktake;
ALTER TABLE stocktake__bjtmp RENAME TO stocktake;
DELETE FROM sqlite_sequence WHERE name='stocktake';
INSERT INTO sqlite_sequence(name, seq)
VALUES('stocktake', COALESCE((SELECT MAX(id) FROM stocktake), 0));


-- === stocktake_line ===
DROP TABLE IF EXISTS stocktake_line__bjtmp;
CREATE TABLE stocktake_line__bjtmp (   id INTEGER PRIMARY KEY AUTOINCREMENT,   stocktake_id INTEGER NOT NULL,   item_id INTEGER NOT NULL,   system_qty INTEGER NOT NULL DEFAULT 0,   counted_qty INTEGER,   diff_qty INTEGER,   updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),   UNIQUE(stocktake_id, item_id),   FOREIGN KEY(stocktake_id) REFERENCES stocktake(id),   FOREIGN KEY(item_id) REFERENCES items(id) );
INSERT INTO stocktake_line__bjtmp SELECT * FROM stocktake_line;
DROP TABLE stocktake_line;
ALTER TABLE stocktake_line__bjtmp RENAME TO stocktake_line;
DELETE FROM sqlite_sequence WHERE name='stocktake_line';
INSERT INTO sqlite_sequence(name, seq)
VALUES('stocktake_line', COALESCE((SELECT MAX(id) FROM stocktake_line), 0));


-- === users ===
DROP TABLE IF EXISTS users__bjtmp;
CREATE TABLE users__bjtmp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','operator','viewer')) DEFAULT 'admin',
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
, token_version INTEGER NOT NULL DEFAULT 0);
INSERT INTO users__bjtmp SELECT * FROM users;
DROP TABLE users;
ALTER TABLE users__bjtmp RENAME TO users;
DELETE FROM sqlite_sequence WHERE name='users';
INSERT INTO sqlite_sequence(name, seq)
VALUES('users', COALESCE((SELECT MAX(id) FROM users), 0));


-- === warehouses ===
DROP TABLE IF EXISTS warehouses__bjtmp;
CREATE TABLE warehouses__bjtmp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
INSERT INTO warehouses__bjtmp SELECT * FROM warehouses;
DROP TABLE warehouses;
ALTER TABLE warehouses__bjtmp RENAME TO warehouses;
DELETE FROM sqlite_sequence WHERE name='warehouses';
INSERT INTO sqlite_sequence(name, seq)
VALUES('warehouses', COALESCE((SELECT MAX(id) FROM warehouses), 0));


PRAGMA foreign_keys=ON;

