import { getSystemSettings } from './services/system-settings';

/**
 * PC warehouse (仓库2：电脑仓) - self-healing schema helper
 * We keep this idempotent so deployments won't break if migrations weren't run yet.
 */

let __pcSchemaReady = false;
let __pcRuntimeDdlAllowedCache: { expiresAt: number; value: boolean } | null = null;
const PC_RUNTIME_DDL_CACHE_TTL_MS = 60_000;

function createPcSchemaMissingError() {
  return Object.assign(new Error('电脑仓数据库结构未就绪，请先执行迁移（npm run migrate:apply -- --db <db> --remote）'), { status: 503, code: 'SCHEMA_NOT_READY' });
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
  if (__pcSchemaReady) return;
  const alreadyReady = await probePcSchemaReady(db);
  if (alreadyReady) {
    __pcSchemaReady = true;
    return;
  }
  if (!(allowBySettings || runtimeHealAllowed)) throw createPcSchemaMissingError();
  return ensurePcSchema(db);
}

export async function ensurePcSchema(db: D1Database) {
  if (__pcSchemaReady) return;
  const ready = await probePcSchemaReady(db);
  if (ready) {
    __pcSchemaReady = true;
    return;
  }
  throw createPcSchemaMissingError();
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
  const checks = await db.batch([
    db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='pc_assets'"),
    db.prepare("SELECT 1 AS ok FROM pragma_table_info('pc_assets') WHERE name='qr_key'"),
    db.prepare("SELECT 1 AS ok FROM pragma_table_info('pc_assets') WHERE name='qr_updated_at'"),
    db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_pc_assets_qr_key'"),
  ]).catch(() => [] as any[]);
  const ok = Array.isArray(checks) && checks.length >= 4 && checks.every((item: any) => Number(item?.results?.[0]?.ok || 0) === 1);
  if (!ok) throw createPcSchemaMissingError();
}
