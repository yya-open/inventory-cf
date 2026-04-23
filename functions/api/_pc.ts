import { getSystemSettings } from './services/system-settings';
import { SQL_STORED_NOW_DEFAULT } from './_time';
import { invalidateSchemaStatusCache } from './services/schema-status';

/**
 * PC warehouse (仓库2：电脑仓) - self-healing schema helper
 * We keep this idempotent so deployments won't break if migrations weren't run yet.
 */

let __pcSchemaReady = false;
let __pcSchemaInit: Promise<void> | null = null;
let __pcGuardEnsuredAt = 0;
let __pcColumnsEnsuredAt = 0;
let __pcColumnsReady = false;
let __pcGuardTriggersReady = false;
let __pcSchemaProbeAt = 0;
let __pcRuntimeDdlAllowedCache: { expiresAt: number; value: boolean } | null = null;
const PC_RUNTIME_DDL_CACHE_TTL_MS = 60_000;
const PC_GUARD_TRIGGER_TTL_MS = 30 * 60_000;
const PC_GUARD_COLUMNS_TTL_MS = 30 * 60_000;
const PC_SCHEMA_PROBE_TTL_MS = 10 * 60_000;

const PC_REQUIRED_QUERY_COLUMNS = [
  'search_text_norm',
  'archived',
  'archived_at',
  'archived_reason',
  'archived_note',
  'archived_by',
  'inventory_status',
  'inventory_at',
  'inventory_issue_type',
  'manufacture_ts',
  'warranty_end_ts',
];

async function ensurePcQueryColumns(db: D1Database) {
  if (__pcColumnsReady) return;
  if (Date.now() - __pcColumnsEnsuredAt < PC_GUARD_COLUMNS_TTL_MS) return;
  __pcColumnsEnsuredAt = Date.now();
  try {
    const tableRow = await db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='pc_assets'").first<any>();
    if (Number(tableRow?.ok || 0) !== 1) return;
    const { results } = await db.prepare("PRAGMA table_info('pc_assets')").all<any>();
    const columns = new Set((results || []).map((row: any) => String(row?.name || '').trim()).filter(Boolean));
    const ddls: string[] = [];
    if (!columns.has('search_text_norm')) ddls.push("ALTER TABLE pc_assets ADD COLUMN search_text_norm TEXT");
    if (!columns.has('archived')) ddls.push("ALTER TABLE pc_assets ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
    if (!columns.has('archived_at')) ddls.push("ALTER TABLE pc_assets ADD COLUMN archived_at TEXT");
    if (!columns.has('archived_reason')) ddls.push("ALTER TABLE pc_assets ADD COLUMN archived_reason TEXT");
    if (!columns.has('archived_note')) ddls.push("ALTER TABLE pc_assets ADD COLUMN archived_note TEXT");
    if (!columns.has('archived_by')) ddls.push("ALTER TABLE pc_assets ADD COLUMN archived_by TEXT");
    if (!columns.has('inventory_status')) ddls.push("ALTER TABLE pc_assets ADD COLUMN inventory_status TEXT NOT NULL DEFAULT 'UNCHECKED'");
    if (!columns.has('inventory_at')) ddls.push("ALTER TABLE pc_assets ADD COLUMN inventory_at TEXT");
    if (!columns.has('inventory_issue_type')) ddls.push("ALTER TABLE pc_assets ADD COLUMN inventory_issue_type TEXT");
    if (!columns.has('manufacture_ts')) ddls.push("ALTER TABLE pc_assets ADD COLUMN manufacture_ts INTEGER");
    if (!columns.has('warranty_end_ts')) ddls.push("ALTER TABLE pc_assets ADD COLUMN warranty_end_ts INTEGER");
    for (const ddl of ddls) {
      try { await db.prepare(ddl).run(); } catch {}
    }
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_id ON pc_assets(archived, id)").run().catch(() => {});
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_inventory_status_id ON pc_assets(archived, inventory_status, id)").run().catch(() => {});
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_inventory_status_id ON pc_assets(inventory_status, id)").run().catch(() => {});
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_reason_id ON pc_assets(archived, archived_reason, id)").run().catch(() => {});
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_search_text_norm ON pc_assets(search_text_norm)").run().catch(() => {});
    await db.prepare("UPDATE pc_assets SET archived=0 WHERE archived IS NULL").run().catch(() => {});
    await db.prepare("UPDATE pc_assets SET inventory_status='UNCHECKED' WHERE COALESCE(TRIM(inventory_status),'')=''").run().catch(() => {});
    const verify = await db.prepare("PRAGMA table_info('pc_assets')").all<any>();
    const verifyColumns = new Set((verify?.results || []).map((row: any) => String(row?.name || '').trim()).filter(Boolean));
    __pcColumnsReady = PC_REQUIRED_QUERY_COLUMNS.every((column) => verifyColumns.has(column));
    if (__pcColumnsReady) invalidateSchemaStatusCache();
  } catch {
    // best-effort column guard
  }
}

async function ensurePcGuardTriggers(db: D1Database) {
  if (__pcGuardTriggersReady) return;
  if (Date.now() - __pcGuardEnsuredAt < PC_GUARD_TRIGGER_TTL_MS) return;
  __pcGuardEnsuredAt = Date.now();
  try {
    const row = await db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='pc_assets'").first<any>();
    if (Number(row?.ok || 0) !== 1) return;
    await db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_pc_assets_serial_non_blank_insert BEFORE INSERT ON pc_assets FOR EACH ROW WHEN TRIM(COALESCE(NEW.serial_no, '')) = '' BEGIN SELECT RAISE(ABORT, '电脑序列号不能为空'); END`).run();
    await db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_pc_assets_serial_non_blank_update BEFORE UPDATE OF serial_no ON pc_assets FOR EACH ROW WHEN TRIM(COALESCE(NEW.serial_no, '')) = '' BEGIN SELECT RAISE(ABORT, '电脑序列号不能为空'); END`).run();
    const triggerRow = await db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='trigger' AND name IN ('trg_pc_assets_serial_non_blank_insert','trg_pc_assets_serial_non_blank_update')").first<any>();
    __pcGuardTriggersReady = Number(triggerRow?.c || 0) >= 2;
    if (__pcGuardTriggersReady) invalidateSchemaStatusCache();
  } catch {
    // best-effort guard creation
  }
}

export async function ensurePcReadFastGuards(db: D1Database) {
  await ensurePcQueryColumns(db);
  await ensurePcGuardTriggers(db);
}

async function probePcSchemaReady(db: D1Database) {
  try {
    const checks = await db.batch([
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='pc_assets'"),
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='pc_asset_latest_state'"),
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_pc_assets_archived_id'"),
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_pc_assets_archived_inventory_status_id'"),
      db.prepare("SELECT 1 AS ok FROM pragma_table_info('pc_assets') WHERE name='inventory_status'"),
      db.prepare("SELECT 1 AS ok FROM pragma_table_info('pc_assets') WHERE name='search_text_norm'"),
    ]);
    return checks.every((item: any) => Number(item?.results?.[0]?.ok || 0) === 1);
  } catch {
    return false;
  }
}

/**
 * Runtime schema self-healing performs DDL and can slow down cold starts.
 * This project now prefers *explicit migrations*.
 *
 * To fully disable runtime DDL (recommended for production), keep ENABLE_RUNTIME_DDL unset.
 * If you really need emergency self-healing, set ENABLE_RUNTIME_DDL=1 temporarily.
 */
export function shouldHealPcSchema(env: any, url: URL) {
  const allow = String(env?.ENABLE_RUNTIME_DDL || "").trim() === "1";
  if (!allow) return false;
  const disabled = String(env?.DISABLE_SCHEMA_HEALING || "").trim() === "1";
  const force = (url.searchParams.get("init") || "").trim() === "1";
  return !disabled || force;
}

export async function ensurePcSchemaIfAllowed(db: D1Database, env: any, url: URL) {
  await ensurePcReadFastGuards(db);
  if (__pcSchemaReady) return;
  if (Date.now() - __pcSchemaProbeAt >= PC_SCHEMA_PROBE_TTL_MS) {
    __pcSchemaProbeAt = Date.now();
    const alreadyReady = await probePcSchemaReady(db);
    if (alreadyReady) {
      __pcSchemaReady = true;
      return;
    }
  }
  const runtimeHealAllowed = shouldHealPcSchema(env, url);
  let allowBySettings = false;
  const cached = __pcRuntimeDdlAllowedCache;
  if (cached && cached.expiresAt > Date.now()) {
    allowBySettings = cached.value;
  } else {
    const settings = await getSystemSettings(db).catch(() => null as any);
    allowBySettings = Boolean(settings?.ops_enable_runtime_ddl);
    __pcRuntimeDdlAllowedCache = { expiresAt: Date.now() + PC_RUNTIME_DDL_CACHE_TTL_MS, value: allowBySettings };
  }
  if (!(allowBySettings || runtimeHealAllowed)) return;
  return ensurePcSchema(db);
}

export async function ensurePcSchema(db: D1Database) {
  // PERF: schema creation / healing is idempotent but expensive if executed on every request.
  // Cloudflare isolates keep module state between requests, so we cache initialization per isolate.
  // Also dedupe concurrent calls with a shared promise.
  if (__pcSchemaReady) return;
  if (__pcSchemaInit) return __pcSchemaInit;

  __pcSchemaInit = (async () => {
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
      manufacture_ts INTEGER,
      warranty_end_ts INTEGER,
      disk_capacity TEXT,
      memory_size TEXT,
      remark TEXT,
      search_text_norm TEXT,
      status TEXT NOT NULL CHECK(status IN ('IN_STOCK','ASSIGNED','RECYCLED','SCRAPPED')) DEFAULT 'IN_STOCK',
      created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
      updated_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
      archived INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      archived_reason TEXT,
      archived_note TEXT,
      archived_by TEXT,
      inventory_status TEXT NOT NULL DEFAULT 'UNCHECKED' CHECK(inventory_status IN ('UNCHECKED','CHECKED_OK','CHECKED_ISSUE')),
      inventory_at TEXT,
      inventory_issue_type TEXT
    )
  `).run();

  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_serial ON pc_assets(serial_no)").run();

  for (const ddl of [
    "ALTER TABLE pc_assets ADD COLUMN search_text_norm TEXT",
    "ALTER TABLE pc_assets ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE pc_assets ADD COLUMN archived_at TEXT",
    "ALTER TABLE pc_assets ADD COLUMN archived_reason TEXT",
    "ALTER TABLE pc_assets ADD COLUMN archived_note TEXT",
    "ALTER TABLE pc_assets ADD COLUMN archived_by TEXT",
    "ALTER TABLE pc_assets ADD COLUMN inventory_status TEXT NOT NULL DEFAULT 'UNCHECKED'",
    "ALTER TABLE pc_assets ADD COLUMN inventory_at TEXT",
    "ALTER TABLE pc_assets ADD COLUMN inventory_issue_type TEXT",
    "ALTER TABLE pc_assets ADD COLUMN manufacture_ts INTEGER",
    "ALTER TABLE pc_assets ADD COLUMN warranty_end_ts INTEGER",
  ]) {
    try {
      await db.prepare(ddl).run();
    } catch {}
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_status ON pc_assets(archived, status, id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_id ON pc_assets(archived, id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_inventory_status_id ON pc_assets(archived, inventory_status, id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_inventory_status_id ON pc_assets(inventory_status, id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_reason_id ON pc_assets(archived, archived_reason, id)").run();
  await db.prepare("DROP INDEX IF EXISTS idx_pc_assets_status").run().catch(() => {});
  await db.prepare("DROP INDEX IF EXISTS idx_pc_assets_archived_mfg_status_id").run().catch(() => {});
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_mfgts_status_id ON pc_assets(archived, manufacture_ts, status, id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_warranty_ts_id ON pc_assets(warranty_end_ts, id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_search_text_norm ON pc_assets(search_text_norm)").run();
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_pc_assets_serial_non_blank_insert BEFORE INSERT ON pc_assets FOR EACH ROW WHEN TRIM(COALESCE(NEW.serial_no, '')) = '' BEGIN SELECT RAISE(ABORT, '电脑序列号不能为空'); END`).run().catch(() => {});
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_pc_assets_serial_non_blank_update BEFORE UPDATE OF serial_no ON pc_assets FOR EACH ROW WHEN TRIM(COALESCE(NEW.serial_no, '')) = '' BEGIN SELECT RAISE(ABORT, '电脑序列号不能为空'); END`).run().catch(() => {});
  await db.prepare(`UPDATE pc_assets SET search_text_norm=LOWER(TRIM(COALESCE(serial_no,'') || ' ' || COALESCE(brand,'') || ' ' || COALESCE(model,'') || ' ' || COALESCE(remark,'') || ' ' || COALESCE(disk_capacity,'') || ' ' || COALESCE(memory_size,''))) WHERE COALESCE(search_text_norm,'')=''`).run();
  await db.prepare(`UPDATE pc_assets
                    SET manufacture_ts = CASE WHEN TRIM(COALESCE(manufacture_date,''))='' THEN NULL ELSE CAST(strftime('%s', TRIM(manufacture_date) || ' 00:00:00') AS INTEGER) END,
                        warranty_end_ts = CASE WHEN TRIM(COALESCE(warranty_end,''))='' THEN NULL ELSE CAST(strftime('%s', TRIM(warranty_end) || ' 00:00:00') AS INTEGER) END
                    WHERE manufacture_ts IS NULL OR warranty_end_ts IS NULL`).run().catch(() => {});
  await db.prepare("DROP TRIGGER IF EXISTS pc_assets_ts_ai").run().catch(() => {});
  await db.prepare("DROP TRIGGER IF EXISTS pc_assets_ts_au").run().catch(() => {});
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS pc_assets_ts_ai AFTER INSERT ON pc_assets BEGIN
    UPDATE pc_assets
    SET manufacture_ts = CASE WHEN TRIM(COALESCE(new.manufacture_date,''))='' THEN NULL ELSE CAST(strftime('%s', TRIM(new.manufacture_date) || ' 00:00:00') AS INTEGER) END,
        warranty_end_ts = CASE WHEN TRIM(COALESCE(new.warranty_end,''))='' THEN NULL ELSE CAST(strftime('%s', TRIM(new.warranty_end) || ' 00:00:00') AS INTEGER) END
    WHERE id = new.id;
  END`).run().catch(() => {});
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS pc_assets_ts_au AFTER UPDATE OF manufacture_date, warranty_end ON pc_assets BEGIN
    UPDATE pc_assets
    SET manufacture_ts = CASE WHEN TRIM(COALESCE(new.manufacture_date,''))='' THEN NULL ELSE CAST(strftime('%s', TRIM(new.manufacture_date) || ' 00:00:00') AS INTEGER) END,
        warranty_end_ts = CASE WHEN TRIM(COALESCE(new.warranty_end,''))='' THEN NULL ELSE CAST(strftime('%s', TRIM(new.warranty_end) || ' 00:00:00') AS INTEGER) END
    WHERE id = new.id;
  END`).run().catch(() => {});

  await db.prepare(`CREATE TABLE IF NOT EXISTS pc_asset_latest_state (
    asset_id INTEGER PRIMARY KEY,
    last_out_id INTEGER,
    last_in_id INTEGER,
    last_recycle_id INTEGER,
    current_employee_no TEXT,
    current_employee_name TEXT,
    current_department TEXT,
    last_config_date TEXT,
    last_out_at TEXT,
    last_in_at TEXT,
    last_recycle_date TEXT,
    updated_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
    FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_asset_latest_state_current_department ON pc_asset_latest_state(current_department, asset_id)").run();


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
          manufacture_ts INTEGER,
          warranty_end_ts INTEGER,
          disk_capacity TEXT,
          memory_size TEXT,
          remark TEXT,
          search_text_norm TEXT,
          status TEXT NOT NULL CHECK(status IN ('IN_STOCK','ASSIGNED','RECYCLED','SCRAPPED')) DEFAULT 'IN_STOCK',
          created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
          updated_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
          archived INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT,
          archived_reason TEXT,
          archived_note TEXT,
          archived_by TEXT,
          inventory_status TEXT NOT NULL DEFAULT 'UNCHECKED' CHECK(inventory_status IN ('UNCHECKED','CHECKED_OK','CHECKED_ISSUE')),
          inventory_at TEXT,
          inventory_issue_type TEXT
        )
      `),
      db.prepare(`
        INSERT INTO pc_assets_v2 (id, brand, serial_no, model, manufacture_date, warranty_end, manufacture_ts, warranty_end_ts, disk_capacity, memory_size, remark, search_text_norm, status, created_at, updated_at, archived, archived_at, archived_reason, archived_note, archived_by, inventory_status, inventory_at, inventory_issue_type)
        SELECT id, brand, serial_no, model, manufacture_date, warranty_end, CASE WHEN TRIM(COALESCE(manufacture_date,''))='' THEN NULL ELSE CAST(strftime('%s', TRIM(manufacture_date) || ' 00:00:00') AS INTEGER) END, CASE WHEN TRIM(COALESCE(warranty_end,''))='' THEN NULL ELSE CAST(strftime('%s', TRIM(warranty_end) || ' 00:00:00') AS INTEGER) END, disk_capacity, memory_size, remark, LOWER(TRIM(COALESCE(serial_no,'') || ' ' || COALESCE(brand,'') || ' ' || COALESCE(model,'') || ' ' || COALESCE(remark,''))), status, created_at, updated_at, COALESCE(archived,0), archived_at, NULL, NULL, NULL, COALESCE(inventory_status, 'UNCHECKED'), inventory_at, inventory_issue_type
        FROM pc_assets
      `),
      db.prepare("DROP TABLE pc_assets"),
      db.prepare("ALTER TABLE pc_assets_v2 RENAME TO pc_assets"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_serial ON pc_assets(serial_no)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_status ON pc_assets(archived, status, id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_id ON pc_assets(archived, id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_inventory_status_id ON pc_assets(archived, inventory_status, id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_archived_mfgts_status_id ON pc_assets(archived, manufacture_ts, status, id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_warranty_ts_id ON pc_assets(warranty_end_ts, id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_inventory_status_id ON pc_assets(inventory_status, id)"),
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
    created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
    created_by TEXT,
    FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
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
      created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
      created_by TEXT,
      FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
    )
  `).run();

  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_in_created_at ON pc_in(created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_in_serial ON pc_in(serial_no)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_in_no ON pc_in(in_no)").run();
  // speed up latest-in lookup by asset_id
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_in_asset_id_id ON pc_in(asset_id, id DESC)").run();

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
      created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
      created_by TEXT,
      FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
    )
  `).run();

  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_out_created_at ON pc_out(created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_out_serial ON pc_out(serial_no)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_out_employee ON pc_out(employee_no)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_out_no ON pc_out(out_no)").run();
  // speed up latest-out lookup by asset_id
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_out_asset_id_id ON pc_out(asset_id, id DESC)").run();


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
      created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
      created_by TEXT,
      FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE
    )
  `).run();

  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_recycle_created_at ON pc_recycle(created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_recycle_serial ON pc_recycle(serial_no)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_recycle_employee ON pc_recycle(employee_no)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_recycle_no ON pc_recycle(recycle_no)").run();
  // speed up latest-recycle lookup by asset_id
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_recycle_asset_id_id ON pc_recycle(asset_id, id DESC)").run();

  // Helpful for transaction list sorting/filtering
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_scrap_created_at ON pc_scrap(created_at)").run();
    __pcSchemaReady = true;
  })().finally(() => {
    __pcSchemaInit = null;
  });

  return __pcSchemaInit;
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
    return db.prepare("SELECT * FROM pc_assets WHERE id=? AND COALESCE(archived,0)=0").bind(id).first<any>();
  }
  if (sn) {
    return db.prepare("SELECT * FROM pc_assets WHERE serial_no=? AND COALESCE(archived,0)=0").bind(sn).first<any>();
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


export async function ensurePcQrColumns(db: D1Database) {
  for (const ddl of [
    "ALTER TABLE pc_assets ADD COLUMN qr_key TEXT",
    "ALTER TABLE pc_assets ADD COLUMN qr_updated_at TEXT",
  ]) {
    try {
      await db.prepare(ddl).run();
    } catch {
      // ignore
    }
  }
  try {
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_assets_qr_key ON pc_assets(qr_key)").run();
  } catch {
    // ignore
  }
}
