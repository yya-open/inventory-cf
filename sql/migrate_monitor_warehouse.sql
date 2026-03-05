PRAGMA foreign_keys = ON;

-- =========================
-- 电脑仓：规范化位置（供电脑/显示器等资产复用）
-- =========================
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

-- =========================
-- 仓库2：显示器（资产化管理）
-- =========================
CREATE TABLE IF NOT EXISTS monitor_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_code TEXT NOT NULL UNIQUE,
  qr_key TEXT,
  qr_updated_at TEXT,
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
  FOREIGN KEY(location_id) REFERENCES pc_locations(id)
);

CREATE INDEX IF NOT EXISTS idx_monitor_assets_status ON monitor_assets(status);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_asset_code ON monitor_assets(asset_code);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_qr_key ON monitor_assets(qr_key);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_sn ON monitor_assets(sn);
CREATE INDEX IF NOT EXISTS idx_monitor_assets_location ON monitor_assets(location_id);

-- 出入库/调拨流水（显示器）
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
  FOREIGN KEY(asset_id) REFERENCES monitor_assets(id),
  FOREIGN KEY(from_location_id) REFERENCES pc_locations(id),
  FOREIGN KEY(to_location_id) REFERENCES pc_locations(id)
);

CREATE INDEX IF NOT EXISTS idx_monitor_tx_created_at ON monitor_tx(created_at);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_asset_id ON monitor_tx(asset_id);
CREATE INDEX IF NOT EXISTS idx_monitor_tx_type ON monitor_tx(tx_type);
