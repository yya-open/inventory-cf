import { getSystemSettings } from './services/system-settings';
import { SQL_STORED_NOW_DEFAULT } from './_time';

/**
 * Monitor warehouse (仓库2：显示器) - optional runtime schema helper
 * Prefer explicit migrations in /sql.
 */

let __monitorSchemaReady = false;
let __monitorSchemaInit: Promise<void> | null = null;

export function shouldHealMonitorSchema(env: any, url: URL) {
  const allow = String(env?.ENABLE_RUNTIME_DDL || "").trim() === "1";
  if (!allow) return false;
  const disabled = String(env?.DISABLE_SCHEMA_HEALING || "").trim() === "1";
  const force = (url.searchParams.get("init") || "").trim() === "1";
  return !disabled || force;
}

export async function ensureMonitorSchemaIfAllowed(db: D1Database, env: any, url: URL) {
  const settings = await getSystemSettings(db).catch(() => null as any);
  const allowBySettings = Boolean(settings?.ops_enable_runtime_ddl);
  if (!(allowBySettings || shouldHealMonitorSchema(env, url))) return;
  return ensureMonitorSchema(db);
}

export async function ensureMonitorSchema(db: D1Database) {
  if (__monitorSchemaReady) return;
  if (__monitorSchemaInit) return __monitorSchemaInit;

  __monitorSchemaInit = (async () => {
    // locations
    await db
      .prepare(`
        CREATE TABLE IF NOT EXISTS pc_locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          parent_id INTEGER,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
          UNIQUE(name, parent_id),
          FOREIGN KEY(parent_id) REFERENCES pc_locations(id)
        )
      `)
      .run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_locations_parent ON pc_locations(parent_id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_pc_locations_enabled ON pc_locations(enabled)").run();

    // monitor assets
    await db
      .prepare(`
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
          search_text_norm TEXT,
          status TEXT NOT NULL CHECK(status IN ('IN_STOCK','ASSIGNED','RECYCLED','SCRAPPED')) DEFAULT 'IN_STOCK',
          location_id INTEGER,
          employee_no TEXT,
          department TEXT,
          employee_name TEXT,
          is_employed TEXT,
          created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
          updated_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
          archived INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT,
          archived_reason TEXT,
          archived_note TEXT,
          archived_by TEXT,
          inventory_status TEXT NOT NULL DEFAULT 'UNCHECKED' CHECK(inventory_status IN ('UNCHECKED','CHECKED_OK','CHECKED_ISSUE')),
          inventory_at TEXT,
          inventory_issue_type TEXT,
          FOREIGN KEY(location_id) REFERENCES pc_locations(id)
        )
      `)
      .run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_asset_code ON monitor_assets(asset_code)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_qr_key ON monitor_assets(qr_key)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_sn ON monitor_assets(sn)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_location ON monitor_assets(location_id)").run();

    // Backward compatibility: add employee fields if early versions created table without them.
    for (const ddl of [
      "ALTER TABLE monitor_assets ADD COLUMN qr_key TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN qr_updated_at TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN search_text_norm TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN employee_no TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN department TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN employee_name TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN is_employed TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE monitor_assets ADD COLUMN archived_at TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN archived_reason TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN archived_note TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN archived_by TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN inventory_status TEXT NOT NULL DEFAULT 'UNCHECKED'",
      "ALTER TABLE monitor_assets ADD COLUMN inventory_at TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN inventory_issue_type TEXT",
    ]) {
      try {
        await db.prepare(ddl).run();
      } catch {
        // ignore
      }
    }
    await db.prepare("DROP INDEX IF EXISTS idx_monitor_assets_status").run().catch(() => {});
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_status ON monitor_assets(archived, status, id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_id ON monitor_assets(archived, id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_inventory_status_id ON monitor_assets(archived, inventory_status, id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_location_id ON monitor_assets(archived, location_id, id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_inventory_status_id ON monitor_assets(inventory_status, id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_archived_reason_id ON monitor_assets(archived, archived_reason, id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_search_text_norm ON monitor_assets(search_text_norm)").run();
    await db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_monitor_assets_code_non_blank_insert BEFORE INSERT ON monitor_assets FOR EACH ROW WHEN TRIM(COALESCE(NEW.asset_code, '')) = '' BEGIN SELECT RAISE(ABORT, '显示器资产编码不能为空'); END`).run().catch(() => {});
    await db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_monitor_assets_code_non_blank_update BEFORE UPDATE OF asset_code ON monitor_assets FOR EACH ROW WHEN TRIM(COALESCE(NEW.asset_code, '')) = '' BEGIN SELECT RAISE(ABORT, '显示器资产编码不能为空'); END`).run().catch(() => {});
    await db.prepare(`UPDATE monitor_assets SET search_text_norm=LOWER(TRIM(COALESCE(asset_code,'') || ' ' || COALESCE(sn,'') || ' ' || COALESCE(brand,'') || ' ' || COALESCE(model,'') || ' ' || COALESCE(remark,'') || ' ' || COALESCE(employee_no,'') || ' ' || COALESCE(employee_name,'') || ' ' || COALESCE(department,''))) WHERE COALESCE(search_text_norm,'')=''`).run();

    // monitor tx
    await db
      .prepare(`
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
          created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
          created_by TEXT,
          ip TEXT,
          ua TEXT,
          FOREIGN KEY(asset_id) REFERENCES monitor_assets(id) ON DELETE CASCADE,
          FOREIGN KEY(from_location_id) REFERENCES pc_locations(id),
          FOREIGN KEY(to_location_id) REFERENCES pc_locations(id)
        )
      `)
      .run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_tx_created_at ON monitor_tx(created_at)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_tx_asset_id ON monitor_tx(asset_id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_tx_type ON monitor_tx(tx_type)").run();

    // monitor inventory log
    await db
      .prepare(`
        CREATE TABLE IF NOT EXISTS monitor_inventory_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          asset_id INTEGER NOT NULL,
          action TEXT NOT NULL CHECK(action IN ('OK','ISSUE')),
          issue_type TEXT,
          remark TEXT,
          ip TEXT,
          ua TEXT,
          created_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT},
          FOREIGN KEY(asset_id) REFERENCES monitor_assets(id) ON DELETE CASCADE
        )
      `)
      .run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_inventory_log_asset_id_created_at ON monitor_inventory_log(asset_id, created_at)").run();

    // public_api_throttle (shared by public QR endpoints)
    await db
      .prepare(`
        CREATE TABLE IF NOT EXISTS public_api_throttle (
          k TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT ${SQL_STORED_NOW_DEFAULT}
        )
      `)
      .run();

    __monitorSchemaReady = true;
  })().finally(() => {
    __monitorSchemaInit = null;
  });

  return __monitorSchemaInit;
}

export function monitorTxNo(prefix = "MONTX") {
  return `${prefix}-${crypto.randomUUID()}`;
}

// Only ensure qr_key columns exist (safe no-op if already present).
// Used by QR-related endpoints so they can work even when migrations were not applied.
export async function ensureMonitorQrColumns(db: D1Database) {
  for (const ddl of [
    "ALTER TABLE monitor_assets ADD COLUMN qr_key TEXT",
    "ALTER TABLE monitor_assets ADD COLUMN qr_updated_at TEXT",
  ]) {
    try {
      await db.prepare(ddl).run();
    } catch {
      // ignore
    }
  }
  try {
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_qr_key ON monitor_assets(qr_key)").run();
  } catch {
    // ignore
  }
}
