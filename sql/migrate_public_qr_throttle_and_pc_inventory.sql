PRAGMA foreign_keys = ON;

-- 1) 公共扫码接口限流（按 route|ip|minute 计数）
CREATE TABLE IF NOT EXISTS public_api_throttle (
  k TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_public_api_throttle_updated_at ON public_api_throttle(updated_at);

-- 2) 电脑工位盘点日志（扫码页“盘点通过/报异常”）
CREATE TABLE IF NOT EXISTS pc_inventory_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  action TEXT NOT NULL, -- 'OK' | 'ISSUE'
  issue_type TEXT,      -- NOT_FOUND/WRONG_LOCATION/WRONG_QR/WRONG_STATUS/MISSING/OTHER
  remark TEXT,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pc_inventory_log_asset_id_created_at ON pc_inventory_log(asset_id, created_at);
