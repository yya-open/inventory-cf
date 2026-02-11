/**
 * PC warehouse (仓库2：电脑仓) - self-healing schema helper
 * We keep this idempotent so deployments won't break if migrations weren't run yet.
 */

export async function ensurePcSchema(db: D1Database) {
  // Ensure warehouse2 exists (for UI selection / consistency)
  await db.prepare("INSERT OR IGNORE INTO warehouses (id, name) VALUES (2, '电脑仓')").run();

  // Tables
  await db.prepare(`
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
    )
  `).run();

  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_status ON pc_assets(status)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_serial ON pc_assets(serial_no)").run();


// If pc_assets already exists, its CHECK constraint might be old (without SCRAPPED).
// D1/SQLite doesn't support ALTER CHECK directly, so we rebuild the table when needed.
try {
  const meta = await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pc_assets'").first<any>();
  const sql: string = (meta as any)?.sql || "";
  if (sql && !sql.includes("'SCRAPPED'")) {
    // rebuild pc_assets to include SCRAPPED status
    await db.batch([
      db.prepare(`
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
        )
      `),
      db.prepare(`
        INSERT INTO pc_assets_v2 (id, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status, created_at, updated_at)
        SELECT id, brand, serial_no, model, manufacture_date, warranty_end, disk_capacity, memory_size, remark, status, created_at, updated_at
        FROM pc_assets
      `),
      db.prepare("DROP TABLE pc_assets"),
      db.prepare("ALTER TABLE pc_assets_v2 RENAME TO pc_assets"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_status ON pc_assets(status)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_serial ON pc_assets(serial_no)"),
    ]);
  }
} catch {
  // ignore schema healing errors
}

// Scrap records (报废单明细)
await db.prepare(`
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
  )
`).run();
await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_scrap_no ON pc_scrap(scrap_no)").run();
await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_scrap_asset ON pc_scrap(asset_id)").run();

  await db.prepare(`
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
    )
  `).run();

  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_in_created_at ON pc_in(created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_in_serial ON pc_in(serial_no)").run();

  await db.prepare(`
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
    )
  `).run();

  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_out_created_at ON pc_out(created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_out_serial ON pc_out(serial_no)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_out_employee ON pc_out(employee_no)").run();


  await db.prepare(`
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
    )
  `).run();

  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_recycle_created_at ON pc_recycle(created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_recycle_serial ON pc_recycle(serial_no)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_recycle_employee ON pc_recycle(employee_no)").run();
}

export type PcAsset = {
  id: number;
  brand: string;
  serial_no: string;
  model: string;
  manufacture_date?: string | null;
  warranty_end?: string | null;
  disk_capacity?: string | null;
  memory_size?: string | null;
  remark?: string | null;
  status: "IN_STOCK" | "ASSIGNED" | "RECYCLED";
  created_at: string;
  updated_at: string;
};

export function normalizeText(v: any, maxLen = 2000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export function must(v: any, fieldName: string, maxLen = 200) {
  const s = normalizeText(v, maxLen);
  if (!s) {
    const err: any = new Error(`${fieldName} 必填`);
    err.status = 400;
    throw err;
  }
  return s;
}

export function optional(v: any, maxLen = 200) {
  const s = normalizeText(v, maxLen);
  return s ? s : null;
}

export function pcInNo() {
  return `PCIN-${crypto.randomUUID()}`;
}

export function pcScrapNo() {
  return `PCSCRAP-${crypto.randomUUID()}`;
}


export function pcOutNo() {
  return `PCOUT-${crypto.randomUUID()}`;
}

export function pcRecycleNo() {
  return `PCR-${crypto.randomUUID()}`;
}

export async function getPcAssetByIdOrSerial(db: D1Database, asset_id?: any, serial_no?: any) {
  const id = Number(asset_id);
  const sn = normalizeText(serial_no, 120);
  if (id) {
    return db.prepare("SELECT * FROM pc_assets WHERE id=?").bind(id).first<any>();
  }
  if (sn) {
    return db.prepare("SELECT * FROM pc_assets WHERE serial_no=?").bind(sn).first<any>();
  }
  return null;
}

export function isInStockStatus(s: any) {
  return String(s) === "IN_STOCK";
}

export function toAssetStatusAfterOut(_recycle_date: any) {
  // 兼容旧逻辑：现在出库固定为“已领用”，回收/归还请走独立动作。
  return "ASSIGNED" as const;
}
