export type ColumnDef = {
  name: string;
  notnull?: boolean;
  dflt_value?: string | null;
  pk?: number;
};

export type TableSchemaDef = {
  name: string;
  columns: ColumnDef[];
  unique_keys?: string[][];
};

export const INTERNAL_SKIP_TABLES = new Set(["restore_job"]);

function cols(list: string[]) {
  return list.map((name) => ({ name }));
}

export const TABLE_SCHEMAS: Record<string, TableSchemaDef> = {
  warehouses: { name: "warehouses", columns: cols(["id","name","created_at"]), unique_keys: [["id"]] },
  items: { name: "items", columns: cols(["id","sku","name","brand","model","category","unit","warning_qty","enabled","created_at"]), unique_keys: [["id"],["sku"]] },
  stock: { name: "stock", columns: cols(["id","item_id","warehouse_id","qty","updated_at"]), unique_keys: [["id"],["item_id","warehouse_id"]] },
  stock_tx: { name: "stock_tx", columns: cols(["id","tx_no","type","item_id","warehouse_id","qty","delta_qty","ref_type","ref_id","ref_no","unit_price","source","target","remark","created_at","created_by"]), unique_keys: [["id"],["tx_no"]] },
  users: { name: "users", columns: cols(["id","username","password_hash","role","is_active","must_change_password","token_version","created_at"]), unique_keys: [["id"],["username"]] },
  auth_login_throttle: { name: "auth_login_throttle", columns: cols(["id","ip","username","fail_count","first_fail_at","last_fail_at","locked_until","updated_at"]), unique_keys: [["id"],["ip","username"]] },
  audit_log: { name: "audit_log", columns: cols(["id","user_id","username","action","entity","entity_id","payload_json","ip","ua","created_at"]), unique_keys: [["id"]] },
  stocktake: { name: "stocktake", columns: cols(["id","st_no","warehouse_id","status","created_at","created_by","applied_at"]), unique_keys: [["id"],["st_no"]] },
  stocktake_line: { name: "stocktake_line", columns: cols(["id","stocktake_id","item_id","system_qty","counted_qty","diff_qty","updated_at"]), unique_keys: [["id"],["stocktake_id","item_id"]] },
  public_api_throttle: { name: "public_api_throttle", columns: cols(["k","count","updated_at"]), unique_keys: [["k"]] },
  pc_locations: { name: "pc_locations", columns: cols(["id","name","parent_id","enabled","created_at"]), unique_keys: [["id"]] },
  pc_assets: { name: "pc_assets", columns: cols(["id","brand","serial_no","model","manufacture_date","warranty_end","disk_capacity","memory_size","remark","status","qr_key","qr_updated_at","created_at","updated_at"]), unique_keys: [["id"],["serial_no"]] },
  pc_in: { name: "pc_in", columns: cols(["id","in_no","asset_id","brand","serial_no","model","manufacture_date","warranty_end","disk_capacity","memory_size","remark","created_at","created_by"]), unique_keys: [["id"],["in_no"]] },
  pc_out: { name: "pc_out", columns: cols(["id","out_no","asset_id","employee_no","department","employee_name","is_employed","brand","serial_no","model","config_date","manufacture_date","warranty_end","disk_capacity","memory_size","remark","recycle_date","created_at","created_by"]), unique_keys: [["id"],["out_no"]] },
  pc_recycle: { name: "pc_recycle", columns: cols(["id","recycle_no","action","asset_id","employee_no","department","employee_name","is_employed","brand","serial_no","model","recycle_date","remark","created_at","created_by"]), unique_keys: [["id"],["recycle_no"]] },
  pc_scrap: { name: "pc_scrap", columns: cols(["id","scrap_no","asset_id","brand","serial_no","model","manufacture_date","warranty_end","disk_capacity","memory_size","remark","scrap_date","reason","created_at","created_by"]), unique_keys: [["id"]] },
  pc_inventory_log: { name: "pc_inventory_log", columns: cols(["id","asset_id","action","issue_type","remark","ip","ua","created_at"]), unique_keys: [["id"]] },
  monitor_assets: { name: "monitor_assets", columns: cols(["id","asset_code","qr_key","qr_updated_at","sn","brand","model","size_inch","remark","status","location_id","employee_no","department","employee_name","is_employed","created_at","updated_at"]), unique_keys: [["id"],["asset_code"],["sn"]] },
  monitor_tx: { name: "monitor_tx", columns: cols(["id","tx_no","tx_type","asset_id","asset_code","sn","brand","model","size_inch","from_location_id","to_location_id","employee_no","department","employee_name","is_employed","remark","created_at","created_by","ip","ua"]), unique_keys: [["id"],["tx_no"]] },
  monitor_inventory_log: { name: "monitor_inventory_log", columns: cols(["id","asset_id","action","issue_type","remark","ip","ua","created_at"]), unique_keys: [["id"]] },
  audit_retention_state: { name: "audit_retention_state", columns: cols(["id","retention_days","last_cleanup_at"]), unique_keys: [["id"]] },
  api_slow_requests: { name: "api_slow_requests", columns: cols(["id","created_at","method","path","query","status","dur_ms","auth_ms","sql_ms","colo","country","user_id"]), unique_keys: [["id"]] },
};

export const INSERT_ORDER = [
  "warehouses","items","users","stock","pc_locations","pc_assets","pc_in","pc_out","pc_recycle","pc_scrap","pc_inventory_log","monitor_assets","monitor_tx","monitor_inventory_log","public_api_throttle","stock_tx","stocktake","stocktake_line","audit_log","auth_login_throttle","audit_retention_state","api_slow_requests"
];

export const DELETE_ORDER = [
  "stocktake_line","stocktake","monitor_inventory_log","monitor_tx","monitor_assets","pc_inventory_log","pc_scrap","pc_recycle","pc_out","pc_in","pc_assets","pc_locations","stock_tx","stock","items","warehouses","audit_log","auth_login_throttle","public_api_throttle","api_slow_requests","audit_retention_state","users"
];

export function sortTablesForInsert(names: string[]) {
  const set = new Set(names.filter((x) => x && !INTERNAL_SKIP_TABLES.has(x)));
  const rest = Object.keys(TABLE_SCHEMAS).filter((t) => set.has(t));
  return INSERT_ORDER.filter((t) => set.has(t)).concat(rest.filter((t) => !INSERT_ORDER.includes(t)));
}

export function sortTablesForDelete(names: string[]) {
  const set = new Set(names.filter((x) => x && !INTERNAL_SKIP_TABLES.has(x)));
  const rest = Object.keys(TABLE_SCHEMAS).filter((t) => set.has(t));
  return DELETE_ORDER.filter((t) => set.has(t)).concat(rest.filter((t) => !DELETE_ORDER.includes(t)));
}

export function getKnownTables() {
  return sortTablesForInsert(Object.keys(TABLE_SCHEMAS));
}

export function getAllTableSchemas() {
  return TABLE_SCHEMAS;
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

export function canSafelyFillMissing(col?: Partial<ColumnDef> | null) {
  if (!col) return true;
  if (col.pk && Number(col.pk) > 0) return true;
  if (!(col as any).notnull) return true;
  if ((col as any).dflt_value != null && String((col as any).dflt_value).trim() !== "") return true;
  return false;
}

function quoteIdent(name: string) {
  return `"${String(name || "").replace(/"/g, '""')}"`;
}

export function pick(obj: any, cols: string[]) {
  return cols.map((c) => (obj?.[c] === undefined ? null : obj[c]));
}

export function buildRestoreInsertSql(table: string, cols: string[], mode: "merge" | "merge_upsert" | "replace", uniqueKeys?: string[][]) {
  const placeholders = cols.map(() => "?").join(",");
  const qTable = quoteIdent(table);
  const qCols = cols.map(quoteIdent).join(",");
  if (mode === "merge") return `INSERT OR IGNORE INTO ${qTable} (${qCols}) VALUES (${placeholders})`;
  if (mode === "replace") return `INSERT OR REPLACE INTO ${qTable} (${qCols}) VALUES (${placeholders})`;
  const conflictCols = (uniqueKeys || []).find((g) => g.every((c) => cols.includes(c))) || [];
  const upCols = cols.filter((c) => !conflictCols.includes(c));
  if (!conflictCols.length || !upCols.length) return `INSERT OR IGNORE INTO ${qTable} (${qCols}) VALUES (${placeholders})`;
  const setClause = upCols.map((c) => `${quoteIdent(c)}=excluded.${quoteIdent(c)}`).join(",");
  return `INSERT INTO ${qTable} (${qCols}) VALUES (${placeholders}) ON CONFLICT (${conflictCols.map(quoteIdent).join(",")}) DO UPDATE SET ${setClause}`;
}
