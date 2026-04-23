import { getSystemSettings } from './services/system-settings';

/**
 * Monitor warehouse (仓库2：显示器) - optional runtime schema helper
 * Prefer explicit migrations in /sql.
 */

let __monitorSchemaReady = false;
let __monitorRuntimeDdlAllowedCache: { expiresAt: number; value: boolean } | null = null;
const MONITOR_RUNTIME_DDL_CACHE_TTL_MS = 60_000;

function createMonitorSchemaMissingError() {
  return Object.assign(new Error('显示器仓数据库结构未就绪，请先执行迁移（npm run migrate:apply -- --db <db> --remote）'), { status: 503, code: 'SCHEMA_NOT_READY' });
}

async function probeMonitorSchemaReady(db: D1Database) {
  try {
    const checks = await db.batch([
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='pc_locations'"),
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='monitor_assets'"),
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_monitor_assets_archived_id'"),
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_monitor_assets_archived_inventory_status_id'"),
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_monitor_assets_archived_location_id'"),
      db.prepare("SELECT 1 AS ok FROM pragma_table_info('monitor_assets') WHERE name='inventory_status'"),
      db.prepare("SELECT 1 AS ok FROM pragma_table_info('monitor_assets') WHERE name='search_text_norm'"),
    ]);
    return checks.every((item: any) => Number(item?.results?.[0]?.ok || 0) === 1);
  } catch {
    return false;
  }
}

export function shouldHealMonitorSchema(env: any, url: URL) {
  const allow = String(env?.ENABLE_RUNTIME_DDL || "").trim() === "1";
  if (!allow) return false;
  const disabled = String(env?.DISABLE_SCHEMA_HEALING || "").trim() === "1";
  const force = (url.searchParams.get("init") || "").trim() === "1";
  return !disabled || force;
}

export async function ensureMonitorSchemaIfAllowed(db: D1Database, env: any, url: URL) {
  const runtimeHealAllowed = shouldHealMonitorSchema(env, url);
  let allowBySettings = false;
  const cached = __monitorRuntimeDdlAllowedCache;
  if (cached && cached.expiresAt > Date.now()) {
    allowBySettings = cached.value;
  } else {
    const settings = await getSystemSettings(db).catch(() => null as any);
    allowBySettings = Boolean(settings?.ops_enable_runtime_ddl);
    __monitorRuntimeDdlAllowedCache = { expiresAt: Date.now() + MONITOR_RUNTIME_DDL_CACHE_TTL_MS, value: allowBySettings };
  }
  if (__monitorSchemaReady) return;
  const alreadyReady = await probeMonitorSchemaReady(db);
  if (alreadyReady) {
    __monitorSchemaReady = true;
    return;
  }
  if (!(allowBySettings || runtimeHealAllowed)) throw createMonitorSchemaMissingError();
  return ensureMonitorSchema(db);
}

export async function ensureMonitorSchema(db: D1Database) {
  if (__monitorSchemaReady) return;
  const ready = await probeMonitorSchemaReady(db);
  if (ready) {
    __monitorSchemaReady = true;
    return;
  }
  throw createMonitorSchemaMissingError();
}

export function monitorTxNo(prefix = "MONTX") {
  return `${prefix}-${crypto.randomUUID()}`;
}

// Only ensure qr_key columns exist (safe no-op if already present).
// Used by QR-related endpoints so they can work even when migrations were not applied.
export async function ensureMonitorQrColumns(db: D1Database) {
  const checks = await db.batch([
    db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='monitor_assets'"),
    db.prepare("SELECT 1 AS ok FROM pragma_table_info('monitor_assets') WHERE name='qr_key'"),
    db.prepare("SELECT 1 AS ok FROM pragma_table_info('monitor_assets') WHERE name='qr_updated_at'"),
    db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_monitor_assets_qr_key'"),
  ]).catch(() => [] as any[]);
  const ok = Array.isArray(checks) && checks.length >= 4 && checks.every((item: any) => Number(item?.results?.[0]?.ok || 0) === 1);
  if (!ok) throw createMonitorSchemaMissingError();
}
