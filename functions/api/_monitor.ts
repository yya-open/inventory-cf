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
  if (!shouldHealMonitorSchema(env, url)) return;
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
          created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
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
          status TEXT NOT NULL CHECK(status IN ('IN_STOCK','ASSIGNED','RECYCLED','SCRAPPED')) DEFAULT 'IN_STOCK',
          location_id INTEGER,
          employee_no TEXT,
          department TEXT,
          employee_name TEXT,
          is_employed TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
          FOREIGN KEY(location_id) REFERENCES pc_locations(id)
        )
      `)
      .run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_status ON monitor_assets(status)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_asset_code ON monitor_assets(asset_code)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_qr_key ON monitor_assets(qr_key)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_sn ON monitor_assets(sn)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_assets_location ON monitor_assets(location_id)").run();

    // Backward compatibility: add employee fields if early versions created table without them.
    for (const ddl of [
      "ALTER TABLE monitor_assets ADD COLUMN qr_key TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN qr_updated_at TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN employee_no TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN department TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN employee_name TEXT",
      "ALTER TABLE monitor_assets ADD COLUMN is_employed TEXT",
    ]) {
      try {
        await db.prepare(ddl).run();
      } catch {
        // ignore
      }
    }

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
          created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours')),
          created_by TEXT,
          ip TEXT,
          ua TEXT,
          FOREIGN KEY(asset_id) REFERENCES monitor_assets(id),
          FOREIGN KEY(from_location_id) REFERENCES pc_locations(id),
          FOREIGN KEY(to_location_id) REFERENCES pc_locations(id)
        )
      `)
      .run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_tx_created_at ON monitor_tx(created_at)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_tx_asset_id ON monitor_tx(asset_id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_monitor_tx_type ON monitor_tx(tx_type)").run();

    __monitorSchemaReady = true;
  })().finally(() => {
    __monitorSchemaInit = null;
  });

  return __monitorSchemaInit;
}

export function monitorTxNo(prefix = "MONTX") {
  return `${prefix}-${crypto.randomUUID()}`;
}
