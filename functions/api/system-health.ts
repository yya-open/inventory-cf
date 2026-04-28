import { errorResponse, json } from '../_auth';
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


export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requirePermission(env, request, 'ops_tools', 'viewer');
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === '1';
    if (!force) {
      const cached = readSystemHealthCache();
      if (cached) return json(true, cached);
      if (systemHealthCache?.pending) return json(true, await systemHealthCache.pending);
    }
    await Promise.all([ensureRequestErrorLogTable(env.DB), ensureAsyncJobsTable(env.DB), ensureAdminRepairHistoryTable(env.DB)]);
    const [schema, scan, pcAssets, latestState, counterRows, failedJobs, errors24h, loginFailures24h, lastRepair, lastDrill, openDrillIssues, overdueDrillIssues, latestMissing, settings] = await Promise.all([
      getSchemaStatus(env.DB, { force }),
      getAutoRepairScan(env.DB, force ? { forceRefresh: true } : { allowStale: true }),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM pc_assets`).first<any>().catch(() => ({ c: 0 })),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM pc_asset_latest_state`).first<any>().catch(() => ({ c: 0 })),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM dictionary_usage_counters`).first<any>().catch(() => ({ c: 0 })),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM async_jobs WHERE status='failed'`).first<any>().catch(() => ({ c: 0 })),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM request_error_log WHERE created_at >= datetime('now','+8 hours','-1 day') AND status >= 500`).first<any>().catch(() => ({ c: 0 })),
      env.DB.prepare(`SELECT COALESCE(SUM(fail_count), 0) AS c FROM auth_login_throttle WHERE last_fail_at >= datetime('now','+8 hours','-1 day')`).first<any>().catch(() => ({ c: 0 })),
      env.DB.prepare(`SELECT created_at, action_label, result_summary FROM admin_repair_history ORDER BY id DESC LIMIT 1`).first<any>().catch(() => null),
      env.DB.prepare(`SELECT drill_at, outcome FROM backup_drill_runs ORDER BY id DESC LIMIT 1`).first<any>().catch(() => null),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM backup_drill_runs WHERE follow_up_status='open'`).first<any>().catch(() => ({ c: 0 })),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM backup_drill_runs WHERE follow_up_status='open' AND rect_due_at IS NOT NULL AND date(rect_due_at) < date('now','+8 hours')`).first<any>().catch(() => ({ c: 0 })),
      env.DB.prepare(`SELECT COUNT(*) AS c FROM pc_assets a LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id WHERE s.asset_id IS NULL`).first<any>().catch(() => ({ c: 0 })),
      getSystemSettings(env.DB).catch(() => null),
    ]);
    const thresholdFailedJobs = Number(settings?.alert_threshold_failed_async_jobs || 20);
    const thresholdError5xx24h = Number(settings?.alert_threshold_error_5xx_last_24h || 10);
    const thresholdLoginFail24h = Number(settings?.alert_threshold_login_failures_last_24h || 30);
    const failedJobsCount = Number(failedJobs?.c || 0);
    const errors24hCount = Number(errors24h?.c || 0);
    const loginFailures24hCount = Number(loginFailures24h?.c || 0);
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
      Number(openDrillIssues?.c || 0) > 0 ? 1 : 0,
    ].reduce((sum, item) => sum + item, 0);
    const payload = {
      schema,
      scan,
      metrics: {
        pc_asset_count: Number(pcAssets?.c || 0),
        pc_latest_state_count: Number(latestState?.c || 0),
        pc_latest_state_missing: Number(latestMissing?.c || 0),
        dictionary_counter_rows: Number(counterRows?.c || 0),
        failed_async_jobs: failedJobsCount,
        error_5xx_last_24h: errors24hCount,
        login_failures_last_24h: loginFailures24hCount,
        last_repair_at: lastRepair?.created_at || null,
        last_repair_label: lastRepair?.action_label || null,
        last_repair_summary: lastRepair?.result_summary || null,
        last_backup_drill_at: lastDrill?.drill_at || null,
        last_backup_drill_outcome: lastDrill?.outcome || null,
        open_backup_drill_issue_count: Number(openDrillIssues?.c || 0),
        overdue_backup_drill_issue_count: Number(overdueDrillIssues?.c || 0),
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
        open_backup_drill_issue_count: Number(openDrillIssues?.c || 0),
        overdue_backup_drill_issue_count: Number(overdueDrillIssues?.c || 0),
      },
    };
    if (!force) {
      systemHealthCache = { value: payload, expiresAt: Date.now() + SYSTEM_HEALTH_CACHE_TTL_MS };
    } else {
      systemHealthCache = null;
    }
    return json(true, payload);
  } catch (e: any) {
    return errorResponse(e);
  }
};
