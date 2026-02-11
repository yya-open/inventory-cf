PRAGMA foreign_keys = ON;

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
  status TEXT NOT NULL CHECK(status IN ('IN_STOCK','ASSIGNED','RECYCLED')) DEFAULT 'IN_STOCK',
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

-- =========================
-- 回收/归还记录（独立动作）
-- =========================
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id)
);

CREATE INDEX IF NOT EXISTS idx_pc_recycle_created_at ON pc_recycle(created_at);
CREATE INDEX IF NOT EXISTS idx_pc_recycle_serial ON pc_recycle(serial_no);
CREATE INDEX IF NOT EXISTS idx_pc_recycle_employee ON pc_recycle(employee_no);

