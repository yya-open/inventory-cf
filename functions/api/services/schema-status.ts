export const REQUIRED_SCHEMA_VERSION = "202603200060_ops_alerts_repair_history";

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
  const sqliteMaster = await db.prepare(`SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index')`).all<any>();
  const rows = sqliteMaster?.results || [];
  const tables = new Set(rows.filter((row: any) => row?.type === 'table').map((row: any) => String(row?.name || '').trim()));
  const indexes = new Set(rows.filter((row: any) => row?.type === 'index').map((row: any) => String(row?.name || '').trim()));
  const [userColumns, asyncJobColumns] = await Promise.all([
    tableInfoColumns(db, 'users'),
    tableInfoColumns(db, 'async_jobs'),
  ]);

  const checks = [
    { key: 'pc_asset_latest_state', label: '电脑快照表', ok: tables.has('pc_asset_latest_state'), need: 'pc_asset_latest_state' },
    { key: 'dictionary_usage_counters', label: '字典引用计数表', ok: tables.has('dictionary_usage_counters'), need: 'dictionary_usage_counters' },
    { key: 'system_settings_meta', label: '系统配置元信息', ok: tables.has('system_settings_meta'), need: 'system_settings_meta' },
    { key: 'users.permission_template_code', label: '用户权限模板字段', ok: userColumns.has('permission_template_code'), need: 'users.permission_template_code' },
    { key: 'users.data_scope_type', label: '用户数据范围字段', ok: userColumns.has('data_scope_type'), need: 'users.data_scope_type' },
    { key: 'async_jobs.retry_count', label: '异步任务重试字段', ok: asyncJobColumns.has('retry_count'), need: 'async_jobs.retry_count' },
    { key: 'async_jobs.cancel_requested', label: '异步任务取消字段', ok: asyncJobColumns.has('cancel_requested'), need: 'async_jobs.cancel_requested' },
    { key: 'async_jobs.retain_until', label: '异步任务保留期字段', ok: asyncJobColumns.has('retain_until'), need: 'async_jobs.retain_until' },
    { key: 'idx_async_jobs_created_by_status', label: '异步任务索引', ok: indexes.has('idx_async_jobs_created_by_status'), need: 'idx_async_jobs_created_by_status' },
    { key: 'ops_scan_state', label: '运维自动巡检缓存表', ok: tables.has('ops_scan_state'), need: 'ops_scan_state' },
    { key: 'backup_drill_runs', label: '备份恢复演练记录表', ok: tables.has('backup_drill_runs'), need: 'backup_drill_runs' },
    { key: 'admin_repair_history', label: '修复历史表', ok: tables.has('admin_repair_history'), need: 'admin_repair_history' },
  ];

  let currentVersion: string | null = null;
  try {
    if (tables.has('schema_migrations')) {
      const row = await db.prepare(`SELECT migration_id FROM schema_migrations ORDER BY applied_at DESC, migration_id DESC LIMIT 1`).first<any>();
      currentVersion = String(row?.migration_id || '').trim() || null;
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
