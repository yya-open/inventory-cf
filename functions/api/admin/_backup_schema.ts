export type BackupMode = 'full';

export type TableGroup = 'core' | 'pc' | 'monitor' | 'system';

export type TableDef = {
  name: string;
  label: string;
  group: TableGroup;
  columns: string[];
  allowExport?: boolean;
  allowRestore?: boolean;
  isSystem?: boolean;
  skipInReplaceDelete?: boolean;
};

export const TABLE_DEFS: TableDef[] = [
  { name: 'warehouses', label: '仓库', group: 'core', columns: ['id','name','created_at'] },
  { name: 'item_categories', label: '物料分类', group: 'core', columns: ['id','name','enabled','created_at','updated_at'] },
  { name: 'items', label: '物料', group: 'core', columns: ['id','sku','name','brand','model','category','category_id','unit','warning_qty','enabled','created_at'] },
  { name: 'stock', label: '库存', group: 'core', columns: ['id','item_id','warehouse_id','qty','updated_at'] },
  { name: 'stock_tx', label: '库存流水', group: 'core', columns: ['id','tx_no','type','item_id','warehouse_id','qty','delta_qty','ref_type','ref_id','ref_no','unit_price','source','target','remark','created_at','created_by'] },
  { name: 'stocktake', label: '盘点单', group: 'core', columns: ['id','st_no','warehouse_id','status','created_at','created_by','applied_at'] },
  { name: 'stocktake_line', label: '盘点明细', group: 'core', columns: ['id','stocktake_id','item_id','system_qty','counted_qty','diff_qty','updated_at'] },
  { name: 'users', label: '用户', group: 'system', columns: ['id','username','password_hash','role','is_active','must_change_password','token_version','created_at'], isSystem: true },
  { name: 'auth_login_throttle', label: '登录限流', group: 'system', columns: ['id','ip','username','fail_count','first_fail_at','last_fail_at','locked_until','updated_at'], isSystem: true },
  { name: 'audit_log', label: '审计日志', group: 'system', columns: ['id','user_id','username','action','entity','entity_id','payload_json','ip','ua','created_at'], isSystem: true },
  { name: 'public_api_throttle', label: '公共接口限流', group: 'system', columns: ['k','count','updated_at'], isSystem: true },
  { name: 'pc_assets', label: '电脑台账', group: 'pc', columns: ['id','brand','serial_no','model','manufacture_date','warranty_end','manufacture_ts','warranty_end_ts','disk_capacity','memory_size','remark','status','qr_key','qr_updated_at','created_at','updated_at'] },
  { name: 'pc_in', label: '电脑入库记录', group: 'pc', columns: ['id','in_no','asset_id','brand','serial_no','model','manufacture_date','warranty_end','disk_capacity','memory_size','remark','created_at','created_by'] },
  { name: 'pc_out', label: '电脑出库记录', group: 'pc', columns: ['id','out_no','asset_id','employee_no','department','employee_name','is_employed','brand','serial_no','model','config_date','manufacture_date','warranty_end','disk_capacity','memory_size','remark','recycle_date','created_at','created_by'] },
  { name: 'pc_recycle', label: '电脑回收/归还记录', group: 'pc', columns: ['id','recycle_no','action','asset_id','employee_no','department','employee_name','is_employed','brand','serial_no','model','recycle_date','remark','created_at','created_by'] },
  { name: 'pc_scrap', label: '电脑报废记录', group: 'pc', columns: ['id','scrap_no','asset_id','brand','serial_no','model','manufacture_date','warranty_end','disk_capacity','memory_size','remark','scrap_date','reason','created_at','created_by'] },
  { name: 'pc_inventory_log', label: '电脑盘点记录', group: 'pc', columns: ['id','asset_id','action','issue_type','remark','ip','ua','created_at'] },
  { name: 'pc_locations', label: '位置表', group: 'pc', columns: ['id','name','parent_id','enabled','created_at'] },
  { name: 'monitor_assets', label: '显示器台账', group: 'monitor', columns: ['id','asset_code','qr_key','qr_updated_at','sn','brand','model','size_inch','remark','status','location_id','employee_no','department','employee_name','is_employed','created_at','updated_at'] },
  { name: 'monitor_tx', label: '显示器出入库明细', group: 'monitor', columns: ['id','tx_no','tx_type','asset_id','asset_code','sn','brand','model','size_inch','from_location_id','to_location_id','employee_no','department','employee_name','is_employed','remark','created_at','created_by','ip','ua'] },
  { name: 'monitor_inventory_log', label: '显示器盘点记录', group: 'monitor', columns: ['id','asset_id','action','issue_type','remark','ip','ua','created_at'] },
  { name: 'restore_job', label: '恢复任务', group: 'system', columns: ['id','status','stage','mode','file_key','filename','created_by','total_rows','processed_rows','current_table','cursor_json','per_table_json','replaced_done','error_count','last_error','created_at','updated_at','snapshot_key','snapshot_status','snapshot_filename','snapshot_created_at','restore_points_json','completed_at'], isSystem: true, allowExport: false, allowRestore: false, skipInReplaceDelete: true },
];

export const TABLE_BY_NAME: Record<string, TableDef> = Object.fromEntries(TABLE_DEFS.map((t) => [t.name, t]));
export const ALL_TABLE_NAMES = TABLE_DEFS.map((t) => t.name);
export const EXPORTABLE_TABLE_NAMES = TABLE_DEFS.filter((t) => t.allowExport !== false).map((t) => t.name);
export const RESTORABLE_TABLE_NAMES = TABLE_DEFS.filter((t) => t.allowRestore !== false).map((t) => t.name);
export const DELETE_ORDER = TABLE_DEFS.filter((t) => !t.skipInReplaceDelete && t.allowRestore !== false).map((t) => t.name).reverse();
export const TABLE_COLUMNS: Record<string, string[]> = Object.fromEntries(TABLE_DEFS.map((t) => [t.name, t.columns]));
export const BACKUP_VERSION = 'inventory-cf-backup-v2';
export const SCHEMA_VERSION = 2;

export function buildBackupMeta(extra?: Record<string, any>) {
  return {
    backup_version: BACKUP_VERSION,
    schema_version: SCHEMA_VERSION,
    app: 'inventory-cf',
    mode: 'full' as BackupMode,
    ...extra,
  };
}

export function groupLabel(group: TableGroup) {
  if (group === 'pc') return '电脑仓';
  if (group === 'monitor') return '显示器';
  if (group === 'system') return '系统表';
  return '基础表';
}
