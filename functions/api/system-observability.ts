import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';
import { ensureRequestErrorLogTable, ensureSlowRequestLogTable } from './services/ops-tools';
import { ensureBrowserObservabilityTables, ensureObservabilityRetentionTables, getObservabilityRetentionPolicy } from './services/observability';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requirePermission(env, request, 'ops_tools', 'admin');
    await Promise.all([
      ensureSlowRequestLogTable(env.DB),
      ensureRequestErrorLogTable(env.DB),
      ensureBrowserObservabilityTables(env.DB),
      ensureObservabilityRetentionTables(env.DB),
    ]);
    const limit = Math.max(1, Math.min(200, Number(new URL(request.url).searchParams.get('limit') || 50)));
    const [slowRows, errorRows, perfRows, eventRows, cleanupRuns, policy] = await Promise.all([
      env.DB.prepare(`SELECT id, method, path, status, total_ms, sql_ms, auth_ms, created_at FROM slow_request_log ORDER BY id DESC LIMIT ?`).bind(limit).all<any>().catch(() => ({ results: [] })),
      env.DB.prepare(`SELECT id, method, path, status, total_ms, sql_ms, auth_ms, created_at FROM request_error_log ORDER BY id DESC LIMIT ?`).bind(limit).all<any>().catch(() => ({ results: [] })),
      env.DB.prepare(`SELECT id, path, full_path, duration_ms, username, created_at FROM browser_perf_log ORDER BY id DESC LIMIT ?`).bind(limit).all<any>().catch(() => ({ results: [] })),
      env.DB.prepare(`SELECT id, event_name, path, full_path, username, metadata_json, created_at FROM browser_event_log ORDER BY id DESC LIMIT ?`).bind(limit).all<any>().catch(() => ({ results: [] })),
      env.DB.prepare(`SELECT id, run_reason, deleted_slow_request_rows, deleted_request_error_rows, deleted_browser_perf_rows, deleted_browser_event_rows, policy_json, created_at FROM observability_cleanup_runs ORDER BY id DESC LIMIT 20`).all<any>().catch(() => ({ results: [] })),
      getObservabilityRetentionPolicy(env.DB).catch(() => ({ slow_request_days: 30, request_error_days: 30, browser_perf_days: 14, browser_event_days: 14 })),
    ]);
    const summary = {
      slow_over_1s: (slowRows.results || []).filter((row: any) => Number(row?.total_ms || 0) >= 1000).length,
      error_5xx: (errorRows.results || []).filter((row: any) => Number(row?.status || 0) >= 500).length,
      browser_routes: Number((perfRows.results || []).length),
      browser_events: Number((eventRows.results || []).length),
    };
    return json(true, {
      slow_requests: slowRows.results || [],
      error_requests: errorRows.results || [],
      browser_perf_rows: perfRows.results || [],
      browser_event_rows: eventRows.results || [],
      cleanup_runs: cleanupRuns.results || [],
      retention_policy: policy,
      summary,
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
