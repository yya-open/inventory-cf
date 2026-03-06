const EXCLUDED_TABLES = new Set([
  'sqlite_sequence',
  'restore_job',
]);

const EXCLUDED_SUFFIXES = [
  '__bjtmp',
];

const PREFERRED_ORDER = [
  'warehouses',
  'items',
  'users',
  'stock',
  'stock_tx',
  'stocktake',
  'stocktake_line',
  'pc_locations',
  'pc_assets',
  'pc_in',
  'pc_out',
  'pc_recycle',
  'pc_scrap',
  'pc_inventory_log',
  'monitor_assets',
  'monitor_tx',
  'monitor_inventory_log',
  'public_api_throttle',
  'auth_login_throttle',
  'audit_log',
  'audit_retention_state',
  'api_slow_requests',
];

const TABLE_LABELS: Record<string, string> = {
  warehouses: '仓库',
  items: '配件',
  stock: '库存',
  stock_tx: '出入库明细',
  stocktake: '盘点单',
  stocktake_line: '盘点明细',
  users: '用户',
  auth_login_throttle: '登录限流',
  audit_log: '审计日志',
  audit_retention_state: '审计清理状态',
  api_slow_requests: '慢请求日志',
  pc_locations: '位置表',
  pc_assets: '电脑台账',
  pc_in: '电脑入库记录',
  pc_out: '电脑出库记录',
  pc_recycle: '电脑回收/归还记录',
  pc_scrap: '电脑报废记录',
  pc_inventory_log: '电脑盘点记录',
  monitor_assets: '显示器台账',
  monitor_tx: '显示器出入库明细',
  monitor_inventory_log: '显示器盘点记录',
  public_api_throttle: '公共接口限流',
};

function shouldExcludeTable(name: string) {
  if (!name) return true;
  if (EXCLUDED_TABLES.has(name)) return true;
  if (name.startsWith('sqlite_')) return true;
  return EXCLUDED_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

export function sortTablesForBackup(tables: string[]) {
  const rank = new Map<string, number>(PREFERRED_ORDER.map((t, i) => [t, i]));
  return [...new Set(tables)]
    .filter((t) => !shouldExcludeTable(t))
    .sort((a, b) => {
      const ra = rank.has(a) ? rank.get(a)! : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b) ? rank.get(b)! : Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
}

export async function listBackupTables(DB: D1Database) {
  const r = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all<any>();
  const names = (r?.results || [])
    .map((row: any) => String(row?.name || '').trim())
    .filter((name: string) => !shouldExcludeTable(name));
  return sortTablesForBackup(names);
}

export async function getTableColumns(DB: D1Database, table: string): Promise<string[]> {
  const r = await DB.prepare(`PRAGMA table_info(${table})`).all<any>();
  return (r?.results || [])
    .map((row: any) => String(row?.name || '').trim())
    .filter(Boolean);
}

export async function getTableColumnsMap(DB: D1Database, tables?: string[]) {
  const names = tables?.length ? sortTablesForBackup(tables) : await listBackupTables(DB);
  const out: Record<string, string[]> = {};
  for (const table of names) {
    const cols = await getTableColumns(DB, table).catch(() => []);
    if (cols.length) out[table] = cols;
  }
  return out;
}

export function getDeleteOrder(tables: string[]) {
  return sortTablesForBackup(tables).slice().reverse();
}

export function getInsertOrder(tables: string[]) {
  return sortTablesForBackup(tables);
}

export function tableLabel(name: string) {
  return TABLE_LABELS[name] || name;
}
