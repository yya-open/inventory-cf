PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS pc_assets_new (
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

INSERT INTO pc_assets_new (
  id, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status, created_at, updated_at
)
SELECT
  id, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status, created_at, updated_at
FROM pc_assets;

DROP TABLE pc_assets;
ALTER TABLE pc_assets_new RENAME TO pc_assets;

CREATE TABLE IF NOT EXISTS pc_scrap (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scrap_no TEXT NOT NULL,
  asset_id INTEGER NOT NULL,
  reason TEXT,
  scrap_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY(asset_id) REFERENCES pc_assets(id)
);

CREATE INDEX IF NOT EXISTS idx_pc_scrap_no ON pc_scrap(scrap_no);
CREATE INDEX IF NOT EXISTS idx_pc_scrap_asset ON pc_scrap(asset_id);

PRAGMA foreign_keys=ON;
