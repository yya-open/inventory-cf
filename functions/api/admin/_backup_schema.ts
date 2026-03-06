export type BackupTableMeta = {
  key: string;
  label: string;
  columns: string[];
  primaryKey?: string;
  exportable?: boolean;
  restorable?: boolean;
  system?: boolean;
  skipReplaceDelete?: boolean;
};

const defs: BackupTableMeta[] = [
  { key: 'warehouses', label: '仓库', columns: ['id','name','created_at'], primaryKey: 'id' },
  { key: 'items', label: '物料', columns: ['id','sku','name','brand','model','category','unit','warning_qty','enabled','created_at'], primaryKey: 'id' },
  { key: 'stock', label: '库存', columns: ['id','item_id','warehouse_id','qty','updated_at'], primaryKey: 'id' },
  { key: 'stock_tx', label: '出入库明细', columns: ['id','tx_no','type','item_id','warehouse_id','qty','delta_qty','ref_type','ref_id','ref_no','unit_price','source','target','remark','created_at','created_by'], primaryKey: 'id' },
  { key: 'stocktake', label: '盘点单', columns: ['id','st_no','warehouse_id','status','created_at','created_by','applied_at'], primaryKey: 'id' },
  { key: 'stocktake_line', label: '盘点明细', columns: ['id','stocktake_id','item_id','system_qty','counted_qty','diff_qty','updated_at'], primaryKey: 'id' },

  { key: 'users', label: '用户', columns: ['id','username','password_hash','role','is_active','must_change_password','token_version','created_at'], primaryKey: 'id', system: true },
  { key: 'auth_login_throttle', label: '登录限流', columns: ['id','ip','username','fail_count','first_fail_at','last_fail_at','locked_until','updated_at'], primaryKey: 'id', system: true },
  { key: 'audit_log', label: '审计日志', columns: ['id','user_id','username','action','entity','entity_id','payload_json','ip','ua','created_at'], primaryKey: 'id', system: true },
  { key: 'audit_retention_state', label: '审计清理状态', columns: ['id','retention_days','last_cleanup_at'], primaryKey: 'id', system: true },
  { key: 'api_slow_requests', label: '慢请求日志', columns: ['id','created_at','method','path','query','status','dur_ms','auth_ms','sql_ms','colo','country','user_id'], primaryKey: 'id', system: true },

  { key: 'pc_locations', label: '位置', columns: ['id','name','parent_id','enabled','created_at'], primaryKey: 'id' },
  { key: 'pc_assets', label: '电脑台账', columns: ['id','brand','serial_no','model','manufacture_date','warranty_end','disk_capacity','memory_size','remark','status','qr_key','qr_updated_at','created_at','updated_at'], primaryKey: 'id' },
  { key: 'pc_in', label: '电脑入库记录', columns: ['id','in_no','asset_id','brand','serial_no','model','manufacture_date','warranty_end','disk_capacity','memory_size','remark','created_at','created_by'], primaryKey: 'id' },
  { key: 'pc_out', label: '电脑出库记录', columns: ['id','out_no','asset_id','employee_no','department','employee_name','is_employed','brand','serial_no','model','config_date','manufacture_date','warranty_end','disk_capacity','memory_size','remark','recycle_date','created_at','created_by'], primaryKey: 'id' },
  { key: 'pc_recycle', label: '电脑回收记录', columns: ['id','recycle_no','action','asset_id','employee_no','department','employee_name','is_employed','brand','serial_no','model','recycle_date','remark','created_at','created_by'], primaryKey: 'id' },
  { key: 'pc_scrap', label: '电脑报废记录', columns: ['id','scrap_no','asset_id','brand','serial_no','model','manufacture_date','warranty_end','disk_capacity','memory_size','remark','scrap_date','reason','created_at','created_by'], primaryKey: 'id' },
  { key: 'pc_inventory_log', label: '电脑盘点记录', columns: ['id','asset_id','action','issue_type','remark','ip','ua','created_at'], primaryKey: 'id' },

  { key: 'monitor_assets', label: '显示器台账', columns: ['id','asset_code','qr_key','qr_updated_at','sn','brand','model','size_inch','remark','status','location_id','employee_no','department','employee_name','is_employed','created_at','updated_at'], primaryKey: 'id' },
  { key: 'monitor_tx', label: '显示器出入库明细', columns: ['id','tx_no','tx_type','asset_id','asset_code','sn','brand','model','size_inch','from_location_id','to_location_id','employee_no','department','employee_name','is_employed','remark','created_at','created_by','ip','ua'], primaryKey: 'id' },
  { key: 'monitor_inventory_log', label: '显示器盘点记录', columns: ['id','asset_id','action','issue_type','remark','ip','ua','created_at'], primaryKey: 'id' },

  { key: 'public_api_throttle', label: '公开接口限流', columns: ['k','count','updated_at'], primaryKey: 'k', system: true },

  // internal job table: validate visibility only, skip backup/restore
  { key: 'restore_job', label: '恢复任务', columns: ['id','status','stage','mode','file_key','filename','created_by','total_rows','processed_rows','current_table','cursor_json','per_table_json','replaced_done','error_count','last_error','created_at','updated_at'], primaryKey: 'id', system: true, exportable: false, restorable: false, skipReplaceDelete: true },
];

export const BACKUP_TABLES = defs;
export const BACKUP_TABLE_MAP: Record<string, BackupTableMeta> = Object.fromEntries(defs.map((x) => [x.key, x]));
export const EXPORTABLE_TABLES = defs.filter((x) => x.exportable !== false).map((x) => x.key);
export const RESTORABLE_TABLES = defs.filter((x) => x.restorable !== false && x.key !== 'restore_job').map((x) => x.key);
export const TABLE_COLUMNS: Record<string, string[]> = Object.fromEntries(defs.map((x) => [x.key, x.columns]));

export const DELETE_ORDER = [
  'stocktake_line',
  'stocktake',
  'monitor_inventory_log',
  'monitor_tx',
  'monitor_assets',
  'pc_inventory_log',
  'pc_scrap',
  'pc_recycle',
  'pc_out',
  'pc_in',
  'pc_assets',
  'pc_locations',
  'stock_tx',
  'stock',
  'items',
  'warehouses',
  'audit_log',
  'auth_login_throttle',
  'public_api_throttle',
  'api_slow_requests',
  'audit_retention_state',
  'users',
].filter((t) => RESTORABLE_TABLES.includes(t));

export const INSERT_ORDER = [
  'warehouses',
  'items',
  'users',
  'audit_retention_state',
  'stock',
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
  'stock_tx',
  'stocktake',
  'stocktake_line',
  'audit_log',
  'auth_login_throttle',
  'api_slow_requests',
].filter((t) => RESTORABLE_TABLES.includes(t));

export function tableLabel(table?: string | null) {
  if (!table) return '（未指定表）';
  return BACKUP_TABLE_MAP[table]?.label || table;
}

export function pickRestoreValues(obj: any, cols: string[]) {
  return cols.map((c) => (obj?.[c] === undefined ? null : obj[c]));
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

export function buildInsertSql(table: string, cols: string[], mode: 'merge' | 'merge_upsert' | 'replace') {
  const placeholders = cols.map(() => '?').join(',');
  if (mode === 'merge') return `INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
  if (mode === 'replace') return `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
  const pk = BACKUP_TABLE_MAP[table]?.primaryKey || 'id';
  const upCols = cols.filter((c) => c !== pk);
  if (!upCols.length) {
    return `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  }
  const setClause = upCols.map((c) => `${c}=excluded.${c}`).join(',');
  return `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT(${pk}) DO UPDATE SET ${setClause}`;
}
