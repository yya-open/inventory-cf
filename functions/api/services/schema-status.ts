export const REQUIRED_SCHEMA_VERSION = '202603200060_ops_alerts_repair_history';

async function tableExists(db: D1Database, name: string) {
  const row = await db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?`).bind(name).first<any>();
  return Number(row?.ok || 0) === 1;
}

async function indexExists(db: D1Database, name: string) {
  const row = await db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name=?`).bind(name).first<any>();
  return Number(row?.ok || 0) === 1;
}

async function tableHasColumn(db: D1Database, table: string, column: string) {
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all<any>();
    return (results || []).some((row: any) => String(row?.name || '') === column);
  } catch {
    return false;
  }
}

export async function getSchemaStatus(db: D1Database) {
  const checks = [
    { key: 'pc_asset_latest_state', label: '电脑快照表', ok: await tableExists(db, 'pc_asset_latest_state'), need: 'pc_asset_latest_state' },
    { key: 'dictionary_usage_counters', label: '字典引用计数表', ok: await tableExists(db, 'dictionary_usage_counters'), need: 'dictionary_usage_counters' },
    { key: 'system_settings_meta', label: '系统配置元信息', ok: await tableExists(db, 'system_settings_meta'), need: 'system_settings_meta' },
    { key: 'users.permission_template_code', label: '用户权限模板字段', ok: await tableHasColumn(db, 'users', 'permission_template_code'), need: 'users.permission_template_code' },
    { key: 'users.data_scope_type', label: '用户数据范围字段', ok: await tableHasColumn(db, 'users', 'data_scope_type'), need: 'users.data_scope_type' },
    { key: 'async_jobs.retry_count', label: '异步任务重试字段', ok: await tableHasColumn(db, 'async_jobs', 'retry_count'), need: 'async_jobs.retry_count' },
    { key: 'async_jobs.cancel_requested', label: '异步任务取消字段', ok: await tableHasColumn(db, 'async_jobs', 'cancel_requested'), need: 'async_jobs.cancel_requested' },
    { key: 'async_jobs.retain_until', label: '异步任务保留期字段', ok: await tableHasColumn(db, 'async_jobs', 'retain_until'), need: 'async_jobs.retain_until' },
    { key: 'idx_async_jobs_created_by_status', label: '异步任务索引', ok: await indexExists(db, 'idx_async_jobs_created_by_status'), need: 'idx_async_jobs_created_by_status' },
    { key: 'ops_scan_state', label: '运维自动巡检缓存表', ok: await tableExists(db, 'ops_scan_state'), need: 'ops_scan_state' },
    { key: 'backup_drill_runs', label: '备份恢复演练记录表', ok: await tableExists(db, 'backup_drill_runs'), need: 'backup_drill_runs' },
    { key: 'admin_repair_history', label: '修复历史表', ok: await tableExists(db, 'admin_repair_history'), need: 'admin_repair_history' },
  ];

  let currentVersion: string | null = null;
  try {
    const tableOk = await tableExists(db, 'schema_migrations');
    if (tableOk) {
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
