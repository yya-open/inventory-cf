export const REQUIRED_SCHEMA_VERSION = "202604210020_ledger_hot_indexes";

type SchemaStatus = {
  ok: boolean;
  required_version: string;
  current_version: string | null;
  missing: string[];
  checks: Array<{ key: string; label: string; ok: boolean; need: string }>;
  message: string;
};

const SCHEMA_STATUS_CACHE_TTL_MS = 30_000;
let schemaStatusCache: { expiresAt: number; value?: SchemaStatus; pending?: Promise<SchemaStatus> } | null = null;

async function tableInfoColumns(db: D1Database, table: string) {
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all<any>();
    return new Set((results || []).map((row: any) => String(row?.name || '').trim()).filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

async function computeSchemaStatus(db: D1Database): Promise<SchemaStatus> {
  const sqliteMaster = await db.prepare(`SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger')`).all<any>();
  const rows = sqliteMaster?.results || [];
  const tables = new Set(rows.filter((row: any) => row?.type === 'table').map((row: any) => String(row?.name || '').trim()));
  const indexes = new Set(rows.filter((row: any) => row?.type === 'index').map((row: any) => String(row?.name || '').trim()));
  const triggers = new Set(rows.filter((row: any) => row?.type === 'trigger').map((row: any) => String(row?.name || '').trim()));
  const [userColumns, asyncJobColumns, restoreJobColumns] = await Promise.all([
    tableInfoColumns(db, 'users'),
    tableInfoColumns(db, 'async_jobs'),
    tableInfoColumns(db, 'restore_job'),
  ]);

  const checks = [
    { key: 'pc_asset_latest_state', label: '电脑快照表', ok: tables.has('pc_asset_latest_state'), need: 'pc_asset_latest_state' },
    { key: 'dictionary_usage_counters', label: '字典引用计数表', ok: tables.has('dictionary_usage_counters'), need: 'dictionary_usage_counters' },
    { key: 'system_settings_meta', label: '系统配置元信息', ok: tables.has('system_settings_meta'), need: 'system_settings_meta' },
    { key: 'users.permission_template_code', label: '用户权限模板字段', ok: userColumns.has('permission_template_code'), need: 'users.permission_template_code' },
    { key: 'users.data_scope_type', label: '用户数据范围字段', ok: userColumns.has('data_scope_type'), need: 'users.data_scope_type' },
    { key: 'users.data_scope_value2', label: '用户双值范围字段', ok: userColumns.has('data_scope_value2'), need: 'users.data_scope_value2' },
    { key: 'restore_job.backup_version', label: '恢复任务备份版本字段', ok: restoreJobColumns.has('backup_version'), need: 'restore_job.backup_version' },
    { key: 'restore_job.integrity_status', label: '恢复任务校验状态字段', ok: restoreJobColumns.has('integrity_status'), need: 'restore_job.integrity_status' },
    { key: 'restore_job.validation_json', label: '恢复任务校验摘要字段', ok: restoreJobColumns.has('validation_json'), need: 'restore_job.validation_json' },
    { key: 'restore_job.verification_json', label: '恢复任务恢复后校验字段', ok: restoreJobColumns.has('verification_json'), need: 'restore_job.verification_json' },
    { key: 'async_jobs.retry_count', label: '异步任务重试字段', ok: asyncJobColumns.has('retry_count'), need: 'async_jobs.retry_count' },
    { key: 'async_jobs.cancel_requested', label: '异步任务取消字段', ok: asyncJobColumns.has('cancel_requested'), need: 'async_jobs.cancel_requested' },
    { key: 'async_jobs.retain_until', label: '异步任务保留期字段', ok: asyncJobColumns.has('retain_until'), need: 'async_jobs.retain_until' },
    { key: 'idx_async_jobs_created_by_status', label: '异步任务索引', ok: indexes.has('idx_async_jobs_created_by_status'), need: 'idx_async_jobs_created_by_status' },
    { key: 'idx_restore_job_integrity_status', label: '恢复任务校验状态索引', ok: indexes.has('idx_restore_job_integrity_status'), need: 'idx_restore_job_integrity_status' },
    { key: 'trg_users_data_scope_valid_insert', label: '用户范围约束触发器', ok: triggers.has('trg_users_data_scope_valid_insert'), need: 'trg_users_data_scope_valid_insert' },
    { key: 'trg_stock_qty_non_negative_update', label: '库存非负约束触发器', ok: triggers.has('trg_stock_qty_non_negative_update'), need: 'trg_stock_qty_non_negative_update' },
    { key: 'trg_pc_assets_serial_non_blank_insert', label: '电脑序列号非空约束触发器', ok: triggers.has('trg_pc_assets_serial_non_blank_insert'), need: 'trg_pc_assets_serial_non_blank_insert' },
    { key: 'trg_monitor_assets_code_non_blank_insert', label: '显示器资产编码非空约束触发器', ok: triggers.has('trg_monitor_assets_code_non_blank_insert'), need: 'trg_monitor_assets_code_non_blank_insert' },
    { key: 'ops_scan_state', label: '运维自动巡检缓存表', ok: tables.has('ops_scan_state'), need: 'ops_scan_state' },
    { key: 'backup_drill_runs', label: '备份恢复演练记录表', ok: tables.has('backup_drill_runs'), need: 'backup_drill_runs' },
    { key: 'admin_repair_history', label: '修复历史表', ok: tables.has('admin_repair_history'), need: 'admin_repair_history' },
    { key: 'idx_report_daily_snapshots_scope_day', label: '看板快照组合索引', ok: indexes.has('idx_report_daily_snapshots_scope_day'), need: 'idx_report_daily_snapshots_scope_day' },
    { key: 'idx_slow_request_log_created_path', label: '慢请求聚合索引', ok: indexes.has('idx_slow_request_log_created_path'), need: 'idx_slow_request_log_created_path' },
    { key: 'idx_request_error_log_created_status', label: '错误请求聚合索引', ok: indexes.has('idx_request_error_log_created_status'), need: 'idx_request_error_log_created_status' },
    { key: 'observability_retention_policy', label: '可观测性保留策略表', ok: tables.has('observability_retention_policy'), need: 'observability_retention_policy' },
    { key: 'observability_cleanup_runs', label: '可观测性清理历史表', ok: tables.has('observability_cleanup_runs'), need: 'observability_cleanup_runs' },
    { key: 'idx_browser_perf_log_path_duration_created', label: '浏览器路由性能复合索引', ok: indexes.has('idx_browser_perf_log_path_duration_created'), need: 'idx_browser_perf_log_path_duration_created' },
    { key: 'idx_browser_event_log_path_event_created', label: '浏览器事件复合索引', ok: indexes.has('idx_browser_event_log_path_event_created'), need: 'idx_browser_event_log_path_event_created' },
    { key: 'idx_asset_inventory_batch_kind_status_closed', label: '盘点历史批次索引', ok: indexes.has('idx_asset_inventory_batch_kind_status_closed'), need: 'idx_asset_inventory_batch_kind_status_closed' },
  ];

  let currentVersion: string | null = null;
  try {
    if (tables.has('schema_migrations')) {
      const row = await db.prepare(`SELECT id FROM schema_migrations ORDER BY applied_at DESC, id DESC LIMIT 1`).first<any>();
      currentVersion = String(row?.id || '').trim() || null;
    }
  } catch {}

  const missing = checks.filter((item) => !item.ok).map((item) => item.need);
  return {
    ok: missing.length === 0,
    required_version: REQUIRED_SCHEMA_VERSION,
    current_version: currentVersion,
    missing,
    checks,
    message: missing.length ? `数据库结构未达到当前版本要求：缺少 ${missing.join('、')}` : '数据库结构已就绪',
  };
}

export async function getSchemaStatus(db: D1Database, options?: { force?: boolean }) {
  const force = !!options?.force;
  const now = Date.now();
  if (!force && schemaStatusCache?.value && schemaStatusCache.expiresAt > now) return schemaStatusCache.value;
  if (!force && schemaStatusCache?.pending) return schemaStatusCache.pending;
  const pending = computeSchemaStatus(db).then((value) => {
    schemaStatusCache = { value, expiresAt: Date.now() + SCHEMA_STATUS_CACHE_TTL_MS };
    return value;
  }).finally(() => {
    if (schemaStatusCache?.pending) schemaStatusCache.pending = undefined;
  });
  schemaStatusCache = { value: schemaStatusCache?.value, expiresAt: schemaStatusCache?.expiresAt || 0, pending };
  return pending;
}

export function invalidateSchemaStatusCache() {
  schemaStatusCache = null;
}
