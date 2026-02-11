PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  category TEXT,
  unit TEXT NOT NULL DEFAULT '个',
  warning_qty INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
CREATE INDEX IF NOT EXISTS idx_stock_wh_item ON stock(warehouse_id, item_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);


-- Users & Auth
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','operator','viewer')) DEFAULT 'admin',
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Login throttle (防爆破/限流)
CREATE TABLE IF NOT EXISTS auth_login_throttle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  username TEXT NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  first_fail_at TEXT,
  last_fail_at TEXT,
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ip, username)
);

CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_locked ON auth_login_throttle(locked_until);



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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_created_at ON audit_log(action, created_at);

-- =========================
-- 仓库2：电脑仓（资产化管理）
-- =========================
INSERT OR IGNORE INTO warehouses (id, name) VALUES (2, '电脑仓');

CREATE TABLE IF NOT EXISTS pc_assets (
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pc_assets_status ON pc_assets(status);
CREATE INDEX IF NOT EXISTS idx_pc_assets_serial ON pc_assets(serial_no);

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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id)
);

CREATE INDEX IF NOT EXISTS idx_pc_in_created_at ON pc_in(created_at);
CREATE INDEX IF NOT EXISTS idx_pc_in_serial ON pc_in(serial_no);

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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id)
);

CREATE INDEX IF NOT EXISTS idx_pc_out_created_at ON pc_out(created_at);
CREATE INDEX IF NOT EXISTS idx_pc_out_serial ON pc_out(serial_no);
CREATE INDEX IF NOT EXISTS idx_pc_out_employee ON pc_out(employee_no);


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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id)
);
CREATE INDEX IF NOT EXISTS idx_pc_scrap_no ON pc_scrap(scrap_no);
CREATE INDEX IF NOT EXISTS idx_pc_scrap_asset ON pc_scrap(asset_id);
