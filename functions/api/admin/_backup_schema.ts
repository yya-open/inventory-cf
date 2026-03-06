export type DbColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: string | null;
  pk: number;
};

export type DbTableSchema = {
  name: string;
  columns: DbColumnInfo[];
  primary_keys: string[];
  unique_keys: string[][];
};

export const INTERNAL_SKIP_TABLES = new Set(["sqlite_sequence", "restore_job"]);

export const BUSINESS_FIRST_ORDER = [
  "warehouses",
  "items",
  "users",
  "stock",
  "pc_locations",
  "pc_assets",
  "pc_in",
  "pc_out",
  "pc_recycle",
  "pc_scrap",
  "pc_inventory_log",
  "monitor_assets",
  "monitor_tx",
  "monitor_inventory_log",
  "public_api_throttle",
  "stock_tx",
  "stocktake",
  "stocktake_line",
  "audit_log",
  "auth_login_throttle",
  "audit_retention_state",
  "api_slow_requests",
  "user_password_history",
];

export const DELETE_FIRST_ORDER = [
  "stocktake_line",
  "stocktake",
  "monitor_inventory_log",
  "monitor_tx",
  "monitor_assets",
  "pc_inventory_log",
  "pc_scrap",
  "pc_recycle",
  "pc_out",
  "pc_in",
  "pc_assets",
  "pc_locations",
  "stock_tx",
  "stock",
  "items",
  "warehouses",
  "audit_log",
  "auth_login_throttle",
  "public_api_throttle",
  "user_password_history",
  "api_slow_requests",
  "audit_retention_state",
  "users",
];

function quoteIdent(name: string) {
  return `"${String(name || "").replace(/"/g, '""')}"`;
}

export function sortTablesForInsert(names: string[]) {
  const wanted = [...new Set(names.filter((x) => x && !INTERNAL_SKIP_TABLES.has(x)))];
  const rank = new Map<string, number>();
  BUSINESS_FIRST_ORDER.forEach((t, i) => rank.set(t, i));
  return wanted.sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a)! : 9999;
    const rb = rank.has(b) ? rank.get(b)! : 9999;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

export function sortTablesForDelete(names: string[]) {
  const wanted = [...new Set(names.filter((x) => x && !INTERNAL_SKIP_TABLES.has(x)))];
  const rank = new Map<string, number>();
  DELETE_FIRST_ORDER.forEach((t, i) => rank.set(t, i));
  return wanted.sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a)! : 9999;
    const rb = rank.has(b) ? rank.get(b)! : 9999;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

export function pick(obj: any, cols: string[]) {
  return cols.map((c) => (obj?.[c] === undefined ? null : obj[c]));
}

export async function listUserTables(db: D1Database, opts?: { includeInternal?: boolean }) {
  const includeInternal = !!opts?.includeInternal;
  const r = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<any>();
  const raw = (r?.results || []).map((x: any) => String(x?.name || "").trim()).filter(Boolean);
  return raw.filter((t) => includeInternal || !INTERNAL_SKIP_TABLES.has(t));
}

export async function getTableColumns(db: D1Database, table: string): Promise<DbColumnInfo[]> {
  const r = await db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all<any>();
  return (r?.results || []).map((x: any) => ({
    cid: Number(x?.cid || 0),
    name: String(x?.name || "").trim(),
    type: String(x?.type || "").trim(),
    notnull: !!Number(x?.notnull || 0),
    dflt_value: x?.dflt_value == null ? null : String(x.dflt_value),
    pk: Number(x?.pk || 0),
  })).filter((x: DbColumnInfo) => !!x.name);
}

export async function getUniqueKeys(db: D1Database, table: string): Promise<string[][]> {
  try {
    const idx = await db.prepare(`PRAGMA index_list(${quoteIdent(table)})`).all<any>();
    const rows = (idx?.results || []).filter((x: any) => Number(x?.unique || 0) === 1);
    const out: string[][] = [];
    for (const it of rows) {
      const name = String(it?.name || "").trim();
      if (!name) continue;
      const info = await db.prepare(`PRAGMA index_info(${quoteIdent(name)})`).all<any>();
      const cols = (info?.results || [])
        .sort((a: any, b: any) => Number(a?.seqno || 0) - Number(b?.seqno || 0))
        .map((x: any) => String(x?.name || "").trim())
        .filter(Boolean);
      if (cols.length) out.push(cols);
    }
    return out;
  } catch {
    return [];
  }
}

export async function getTableSchema(db: D1Database, table: string): Promise<DbTableSchema | null> {
  const columns = await getTableColumns(db, table);
  if (!columns.length) return null;
  const primary_keys = columns.filter((x) => x.pk > 0).sort((a, b) => a.pk - b.pk).map((x) => x.name);
  const unique_keys = await getUniqueKeys(db, table);
  return { name: table, columns, primary_keys, unique_keys };
}

export async function getAllTableSchemas(db: D1Database, opts?: { includeInternal?: boolean }) {
  const tables = await listUserTables(db, opts);
  const out: Record<string, DbTableSchema> = {};
  for (const table of tables) {
    const schema = await getTableSchema(db, table);
    if (schema) out[table] = schema;
  }
  return out;
}

export function sampleRowColumns(rows: any[] | undefined): string[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  const set = new Set<string>();
  for (let i = 0; i < rows.length && i < 20; i++) {
    const r = rows[i];
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      for (const k of Object.keys(r)) set.add(k);
    }
  }
  return [...set];
}

export function canSafelyFillMissing(col?: Partial<DbColumnInfo> | null) {
  if (!col) return true;
  if (col.pk && Number(col.pk) > 0) return true;
  if (!col.notnull) return true;
  if (col.dflt_value != null && String(col.dflt_value).trim() !== "") return true;
  return false;
}

export function buildRestoreInsertSql(table: string, cols: string[], mode: "merge" | "merge_upsert" | "replace", uniqueKeys?: string[][]) {
  const placeholders = cols.map(() => "?").join(",");
  const qTable = quoteIdent(table);
  const qCols = cols.map(quoteIdent).join(",");
  if (mode === "merge") {
    return `INSERT OR IGNORE INTO ${qTable} (${qCols}) VALUES (${placeholders})`;
  }
  if (mode === "replace") {
    return `INSERT OR REPLACE INTO ${qTable} (${qCols}) VALUES (${placeholders})`;
  }
  const conflictCols = (uniqueKeys || []).find((g) => g.every((c) => cols.includes(c))) || [];
  const upCols = cols.filter((c) => !conflictCols.includes(c));
  if (!conflictCols.length || !upCols.length) {
    return `INSERT OR IGNORE INTO ${qTable} (${qCols}) VALUES (${placeholders})`;
  }
  const setClause = upCols.map((c) => `${quoteIdent(c)}=excluded.${quoteIdent(c)}`).join(",");
  return `INSERT INTO ${qTable} (${qCols}) VALUES (${placeholders}) ON CONFLICT (${conflictCols.map(quoteIdent).join(",")}) DO UPDATE SET ${setClause}`;
}
