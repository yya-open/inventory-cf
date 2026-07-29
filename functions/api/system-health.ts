import { json } from '../_auth';
import { withErrorHandling } from './_error';
import { requirePermission } from '../_permissions';
import { getSchemaStatus } from './services/schema-status';
import { ensureRequestErrorLogTable, getAutoRepairScan, ensureAdminRepairHistoryTable } from './services/ops-tools';
import { ensureAsyncJobsTable } from './services/async-jobs';
import { getSystemSettings } from './services/system-settings';


const SYSTEM_HEALTH_CACHE_TTL_MS = 180_000;
let systemHealthCache: { expiresAt: number; value?: any; pending?: Promise<any> } | null = null;

function readSystemHealthCache() {
  if (!systemHealthCache?.value) return null;
  if (Number(systemHealthCache.expiresAt || 0) <= Date.now()) {
    systemHealthCache = null;
    return null;
  }
  return systemHealthCache.value;
}

const HEALTH_AGGREGATE_FIELDS: { key: string; expr: string }[] = [
  { key: 'pc_asset_count', expr: `SELECT COUNT(*) AS v FROM pc_assets` },
  { key: 'pc_latest_state_count', expr: `SELECT COUNT(*) AS v FROM pc_asset_latest_state` },
  { key: 'dictionary_counter_rows', expr: `SELECT COUNT(*) AS v FROM dictionary_usage_counters` },
  { key: 'failed_async_jobs', expr: `SELECT COUNT(*) AS v FROM async_jobs WHERE status='failed'` },
  { key: 'error_5xx_last_24h', expr: `SELECT COUNT(*) AS v FROM request_error_log WHERE created_at >= datetime('now','+8 hours','-1 day') AND status >= 500` },
  { key: 'login_failures_last_24h', expr: `SELECT COALESCE(SUM(fail_count), 0) AS v FROM auth_login_throttle WHERE last_fail_at >= datetime('now','+8 hours','-1 day')` },
  { key: 'open_backup_drill_issue_count', expr: `SELECT COUNT(*) AS v FROM backup_drill_runs WHERE follow_up_status='open'` },
  { key: 'overdue_backup_drill_issue_count', expr: `SELECT COUNT(*) AS v FROM backup_drill_runs WHERE follow_up_status='open' AND rect_due_at IS NOT NULL AND date(rect_due_at) < date('now','+8 hours')` },
  { key: 'pc_latest_state_missing', expr: `SELECT COUNT(*) AS v FROM pc_assets a LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id WHERE s.asset_id IS NULL` },
];

// Fold every scalar health metric into one round trip; fall back to per-metric queries so a single
// missing table in a partially-migrated database cannot zero out the rest.
async function readHealthAggregates(db: D1Database): Promise<Record<string, number>> {
  const consolidated = `SELECT ${HEALTH_AGGREGATE_FIELDS.map((f) => `(${f.expr}) AS ${f.key}`).join(', ')}`;
  const row = await db.prepare(consolidated).first<any>().catch(() => null);
  if (row) {
    return Object.fromEntries(HEALTH_AGGREGATE_FIELDS.map((f) => [f.key, Number(row[f.key] || 0)]));
  }
  const values = await Promise.all(
    HEALTH_AGGREGATE_FIELDS.map((f) => db.prepare(f.expr).first<any>().then((r) => Number(r?.v || 0)).catch(() => 0)),
  );
  return Object.fromEntries(HEALTH_AGGREGATE_FIELDS.map((f, i) => [f.key, values[i]]));
}


export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  await requirePermission(env, request, 'ops_tools', 'viewer');
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === '1';
    if (!force) {
      const cached = readSystemHealthCache();
      if (cached) return json(true, cached);
      if (systemHealthCache?.pending) return json(true, await systemHealthCache.pending);
    }
    await Promise.all([ensureRequestErrorLogTable(env.DB), ensureAsyncJobsTable(env.DB), ensureAdminRepairHistoryTable(env.DB)]);
    const [schema, scan, aggregates, lastRepair, lastDrill, settings] = await Promise.all([
      getSchemaStatus(env.DB, { force }),
      getAutoRepairScan(env.DB, force ? { forceRefresh: true } : { allowStale: true }),
      readHealthAggregates(env.DB),
      env.DB.prepare(`SELECT created_at, action_label, result_summary FROM admin_repair_history ORDER BY id DESC LIMIT 1`).first<any>().catch(() => null),
      env.DB.prepare(`SELECT drill_at, outcome FROM backup_drill_runs ORDER BY id DESC LIMIT 1`).first<any>().catch(() => null),
      getSystemSettings(env.DB).catch(() => null),
    ]);
    const thresholdFailedJobs = Number(settings?.alert_threshold_failed_async_jobs || 20);
    const thresholdError5xx24h = Number(settings?.alert_threshold_error_5xx_last_24h || 10);
    const thresholdLoginFail24h = Number(settings?.alert_threshold_login_failures_last_24h || 30);
    const failedJobsCount = Number(aggregates.failed_async_jobs || 0);
    const errors24hCount = Number(aggregates.error_5xx_last_24h || 0);
    const loginFailures24hCount = Number(aggregates.login_failures_last_24h || 0);
    const openDrillIssueCount = Number(aggregates.open_backup_drill_issue_count || 0);
    const overdueDrillIssueCount = Number(aggregates.overdue_backup_drill_issue_count || 0);
    const overFailedJobsThreshold = failedJobsCount >= thresholdFailedJobs;
    const overError5xxThreshold = errors24hCount >= thresholdError5xx24h;
    const overLoginFailThreshold = loginFailures24hCount >= thresholdLoginFail24h;
    const activeAlerts = [
      !schema.ok ? 1 : 0,
      Number(scan?.total_problem_count || 0) > 0 ? 1 : 0,
      failedJobsCount > 0 ? 1 : 0,
      errors24hCount > 0 ? 1 : 0,
      overFailedJobsThreshold ? 1 : 0,
      overError5xxThreshold ? 1 : 0,
      overLoginFailThreshold ? 1 : 0,
      openDrillIssueCount > 0 ? 1 : 0,
    ].reduce((sum, item) => sum + item, 0);
    const payload = {
      schema,
      scan,
      metrics: {
        pc_asset_count: Number(aggregates.pc_asset_count || 0),
        pc_latest_state_count: Number(aggregates.pc_latest_state_count || 0),
        pc_latest_state_missing: Number(aggregates.pc_latest_state_missing || 0),
        dictionary_counter_rows: Number(aggregates.dictionary_counter_rows || 0),
        failed_async_jobs: failedJobsCount,
        error_5xx_last_24h: errors24hCount,
        login_failures_last_24h: loginFailures24hCount,
        last_repair_at: lastRepair?.created_at || null,
        last_repair_label: lastRepair?.action_label || null,
        last_repair_summary: lastRepair?.result_summary || null,
        last_backup_drill_at: lastDrill?.drill_at || null,
        last_backup_drill_outcome: lastDrill?.outcome || null,
        open_backup_drill_issue_count: openDrillIssueCount,
        overdue_backup_drill_issue_count: overdueDrillIssueCount,
        active_alert_count: activeAlerts,
        thresholds: {
          failed_async_jobs: thresholdFailedJobs,
          error_5xx_last_24h: thresholdError5xx24h,
          login_failures_last_24h: thresholdLoginFail24h,
        },
      },
      alerts: {
        has_active_alerts: activeAlerts > 0,
        active_count: activeAlerts,
        schema_issue: !schema.ok,
        scan_issue: Number(scan?.total_problem_count || 0) > 0,
        failed_jobs: failedJobsCount,
        error_5xx_last_24h: errors24hCount,
        login_failures_last_24h: loginFailures24hCount,
        threshold_breaches: {
          failed_jobs: overFailedJobsThreshold,
          error_5xx_last_24h: overError5xxThreshold,
          login_failures_last_24h: overLoginFailThreshold,
        },
        open_backup_drill_issue_count: openDrillIssueCount,
        overdue_backup_drill_issue_count: overdueDrillIssueCount,
      },
    };
    if (!force) {
      systemHealthCache = { value: payload, expiresAt: Date.now() + SYSTEM_HEALTH_CACHE_TTL_MS };
    } else {
      systemHealthCache = null;
    }
    return json(true, payload);
});
