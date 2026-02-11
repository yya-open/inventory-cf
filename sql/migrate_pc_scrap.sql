-- 电脑仓：报废功能迁移
-- 1) pc_assets 增加 SCRAPPED 状态（通过重建表实现）
-- 2) 新增 pc_scrap 报废明细表

-- 注意：请在执行前备份数据库

-- ===== 1) 重建 pc_assets（如果还没有 SCRAPPED）=====
-- 如果你的 pc_assets 已包含 'SCRAPPED'，可跳过本段
CREATE TABLE IF NOT EXISTS pc_assets_v2 (
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

INSERT INTO pc_assets_v2 (id, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status, created_at, updated_at)
SELECT id, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status, created_at, updated_at
FROM pc_assets;

DROP TABLE pc_assets;
ALTER TABLE pc_assets_v2 RENAME TO pc_assets;

CREATE INDEX IF NOT EXISTS idx_pc_assets_status ON pc_assets(status);
CREATE INDEX IF NOT EXISTS idx_pc_assets_serial ON pc_assets(serial_no);

-- ===== 2) 新增 pc_scrap =====
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
