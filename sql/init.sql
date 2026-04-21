-- Timestamp defaults in SQL schema files should stay aligned with
-- functions/api/_time.ts: SQL_STORED_NOW_DEFAULT (stored Beijing text time).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at);

CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE TABLE IF NOT EXISTS item_categories (

  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);
CREATE INDEX IF NOT EXISTS idx_item_categories_enabled_name ON item_categories(enabled, name);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  category TEXT,
  category_id INTEGER,
  unit TEXT NOT NULL DEFAULT '个',
  warning_qty INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  FOREIGN KEY(category_id) REFERENCES item_categories(id)
);

CREATE TABLE IF NOT EXISTS stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  UNIQUE(item_id, warehouse_id),
  FOREIGN KEY(item_id) REFERENCES items(id),
  FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);

CREATE TABLE IF NOT EXISTS stock_tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_no TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('IN','OUT','ADJUST','REVERSAL')),
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  delta_qty INTEGER NOT NULL DEFAULT 0,
  ref_type TEXT,
  ref_id INTEGER,
  ref_no TEXT,
  unit_price REAL,
  source TEXT,
  target TEXT,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  created_by TEXT,
  FOREIGN KEY(item_id) REFERENCES items(id),
  FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_tx_created_at ON stock_tx(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_tx_item ON stock_tx(item_id);

-- P1 indexes & idempotency (fresh install)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_tx_ref_no_rid
  ON stock_tx(ref_no)
  WHERE ref_no LIKE 'rid:%';

CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_created_at ON stock_tx(warehouse_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_tx_item_created_at ON stock_tx(item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_tx_type_created_at ON stock_tx(type, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_tx_wh_type_created_at ON stock_tx(warehouse_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_tx_ref_type_ref_id_item_wh ON stock_tx(ref_type, ref_id, item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_wh_item ON stock(warehouse_id, item_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id);


-- Users & Auth
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','operator','viewer')) DEFAULT 'admin',
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
  permission_template_code TEXT,
  data_scope_type TEXT NOT NULL DEFAULT 'all',
  data_scope_value TEXT,
  data_scope_value2 TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_data_scope_type_value_v2 ON users(data_scope_type, data_scope_value, data_scope_value2);

-- Login throttle (防爆破/限流)
CREATE TABLE IF NOT EXISTS auth_login_throttle (
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

CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_locked ON auth_login_throttle(locked_until);
CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_ip_username_locked ON auth_login_throttle(ip, username, locked_until);



INSERT OR IGNORE INTO warehouses (id, name) VALUES (1, '主仓');

INSERT OR IGNORE INTO items (id, sku, name, brand, model, category, unit, warning_qty) VALUES
(1, 'RAM-16G-DDR4-3200', '内存条 16G DDR4 3200', 'Kingston', 'DDR4-3200', '内存', '条', 2),
(2, 'SSD-1T-NVME', 'NVMe SSD 1TB', 'Samsung', '980', '硬盘', '块', 1);


-- Default admin (please change password after first login)
INSERT OR IGNORE INTO users (id, username, password_hash, role, is_active, must_change_password)
VALUES (1, 'admin', 'pbkdf2$100000$MEg44sOf2APw8x1HQEipVQ$x1a47ows6TbAAFmg4n4gBKAzZtPD0fEX7D8lHXitiQ0', 'admin', 1, 1);


CREATE TABLE IF NOT EXISTS audit_log (
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
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_created_at ON audit_log(action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_username_created_at ON audit_log(username, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_module_created_at ON audit_log(module_code, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_high_risk_created_at ON audit_log(high_risk, created_at);

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
CREATE INDEX IF NOT EXISTS idx_slow_request_log_created_path ON slow_request_log(created_at DESC, path, status);

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
CREATE INDEX IF NOT EXISTS idx_request_error_log_created_status ON request_error_log(created_at DESC, status, path);

-- =========================
-- 仓库2：电脑仓（资产化管理）
-- =========================
INSERT OR IGNORE INTO warehouses (id, name) VALUES (2, '电脑仓');

-- 电脑仓：规范化位置（供电脑/显示器等资产复用）
CREATE TABLE IF NOT EXISTS pc_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  UNIQUE(name, parent_id),
  FOREIGN KEY(parent_id) REFERENCES pc_locations(id)
);
CREATE INDEX IF NOT EXISTS idx_pc_locations_parent ON pc_locations(parent_id);
CREATE INDEX IF NOT EXISTS idx_pc_locations_enabled ON pc_locations(enabled);

CREATE TABLE IF NOT EXISTS pc_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  serial_no TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  manufacture_date TEXT,
  warranty_end TEXT,
  manufacture_ts INTEGER,
  warranty_end_ts INTEGER,
  disk_capacity TEXT,
  memory_size TEXT,
  remark TEXT,
  status TEXT NOT NULL CHECK(status IN ('IN_STOCK','ASSIGNED','RECYCLED','SCRAPPED')) DEFAULT 'IN_STOCK',
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  archived_reason TEXT,
  archived_note TEXT,
  archived_by TEXT,
  inventory_status TEXT NOT NULL DEFAULT 'UNCHECKED' CHECK(inventory_status IN ('UNCHECKED','CHECKED_OK','CHECKED_ISSUE')),
  inventory_at TEXT,
  inventory_issue_type TEXT
);

CREATE INDEX IF NOT EXISTS idx_pc_assets_serial ON pc_assets(serial_no);
CREATE INDEX IF NOT EXISTS idx_pc_assets_status_id ON pc_assets(status, id);
CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_status ON pc_assets(archived, status, id);
CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_id ON pc_assets(archived, id);
CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_inventory_status_id ON pc_assets(archived, inventory_status, id);
CREATE INDEX IF NOT EXISTS idx_pc_assets_inventory_status_id ON pc_assets(inventory_status, id);
CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_reason_id ON pc_assets(archived, archived_reason, id);
CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_mfgts_status_id ON pc_assets(archived, manufacture_ts, status, id);
CREATE INDEX IF NOT EXISTS idx_pc_assets_warranty_ts_id ON pc_assets(warranty_end_ts, id);

CREATE TABLE IF NOT EXISTS pc_in (
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

CREATE INDEX IF NOT EXISTS idx_pc_in_created_at ON pc_in(created_at);
CREATE INDEX IF NOT EXISTS idx_pc_in_serial ON pc_in(serial_no);
CREATE INDEX IF NOT EXISTS idx_pc_in_asset_id_id ON pc_in(asset_id, id DESC);

CREATE TABLE IF NOT EXISTS pc_out (
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

CREATE INDEX IF NOT EXISTS idx_pc_out_created_at ON pc_out(created_at);
CREATE INDEX IF NOT EXISTS idx_pc_out_serial ON pc_out(serial_no);
CREATE INDEX IF NOT EXISTS idx_pc_out_employee ON pc_out(employee_no);
CREATE INDEX IF NOT EXISTS idx_pc_out_asset_id_id ON pc_out(asset_id, id DESC);


-- 报废单明细（电脑仓）
CREATE TABLE IF NOT EXISTS pc_scrap (
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
CREATE INDEX IF NOT EXISTS idx_pc_scrap_no ON pc_scrap(scrap_no);
CREATE INDEX IF NOT EXISTS idx_pc_scrap_asset ON pc_scrap(asset_id);
CREATE INDEX IF NOT EXISTS idx_pc_scrap_asset_created_at ON pc_scrap(asset_id, created_at);

-- =========================
-- 仓库2：显示器（资产化管理）
-- =========================
CREATE TABLE IF NOT EXISTS monitor_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_code TEXT NOT NULL UNIQUE,
  sn TEXT,
  brand TEXT,
  model TEXT,
  size_inch TEXT,
  remark TEXT,
  status TEXT NOT NULL CHECK(status IN ('IN_STOCK','ASSIGNED','RECYCLED','SCRAPPED')) DEFAULT 'IN_STOCK',
  location_id INTEGER,
  employee_no TEXT,
  department TEXT,
  employee_name TEXT,
  is_employed TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  archived_reason TEXT,
  archived_note TEXT,
  archived_by TEXT,
  inventory_status TEXT NOT NULL DEFAULT 'UNCHECKED' CHECK(inventory_status IN ('UNCHECKED','CHECKED_OK','CHECKED_ISSUE')),
  inventory_at TEXT,
  inventory_issue_type TEXT,
  FOREIGN KEY(location_id) REFERENCES pc_locations(id)
);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_asset_code ON monitor_assets(asset_code);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_sn ON monitor_assets(sn);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_location ON monitor_assets(location_id);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_status_location_id ON monitor_assets(status, location_id, id);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_status ON monitor_assets(archived, status, id);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_id ON monitor_assets(archived, id);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_inventory_status_id ON monitor_assets(archived, inventory_status, id);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_inventory_status_id ON monitor_assets(inventory_status, id);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_reason_id ON monitor_assets(archived, archived_reason, id);

CREATE TABLE IF NOT EXISTS monitor_tx (
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
CREATE INDEX IF NOT EXISTS idx_monitor_tx_created_at ON monitor_tx(created_at);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_asset_id ON monitor_tx(asset_id);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_type ON monitor_tx(tx_type);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_type_created_at ON monitor_tx(tx_type, created_at);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_asset_type_created_at ON monitor_tx(asset_id, tx_type, created_at);

CREATE TABLE IF NOT EXISTS report_daily_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  mode TEXT NOT NULL,
  warehouse_id INTEGER NOT NULL DEFAULT 0,
  scope_key TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
  UNIQUE(snapshot_date, mode, warehouse_id, scope_key)
);
CREATE INDEX IF NOT EXISTS idx_report_daily_snapshots_lookup ON report_daily_snapshots(mode, warehouse_id, snapshot_date, scope_key);
