import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';
import { ensureRequestErrorLogTable, ensureSlowRequestLogTable } from './services/ops-tools';
import { ensureBrowserObservabilityTables, getObservabilityRetentionPolicy, percentile, summarizeRouteDurations } from './services/observability';

type PerfPayload = {
  range_days: number;
  summary: Record<string, number>;
  top_slow_paths: any[];
  top_error_paths: any[];
  recent_slow_requests: any[];
  recent_error_requests: any[];
  browser_summary: Record<string, number>;
  browser_top_routes: any[];
  browser_recent_routes: any[];
  browser_top_events: any[];
  browser_recent_events: any[];
  daily_browser_trend: any[];
  retention_policy: Record<string, number>;
  endpoint_baselines: Array<{
    endpoint: string;
    request_count: number;
    p50_total_ms: number;
    p95_total_ms: number;
    p99_total_ms: number;
    avg_total_ms: number;
    error_5xx_count: number;
  }>;
  index_recommendations: Array<{ key: string; label: string; status: 'ready' | 'recommended'; detail: string }>;
};

type CacheEntry = { expiresAt: number; value?: PerfPayload; pending?: Promise<PerfPayload> };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30_000;

function toSafeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

async function loadPerfPayload(db: D1Database, days: number): Promise<PerfPayload> {
  await Promise.all([ensureSlowRequestLogTable(db), ensureRequestErrorLogTable(db), ensureBrowserObservabilityTables(db)]);
  const since = `-${days} day`;
  const [
    slowRowsRes,
    errorRowsRes,
    topSlowRes,
    topErrorRes,
    statusRes,
    browserRouteRowsRes,
    browserTopRoutesRes,
    browserTopEventsRes,
    browserRecentEventsRes,
    browserTrendRes,
    retentionPolicy,
    endpointRowsRes,
    endpoint5xxRes,
  ] = await Promise.all([
    db.prepare(`SELECT id, method, path, status, total_ms, sql_ms, auth_ms, created_at FROM slow_request_log WHERE created_at >= datetime('now','+8 hours', ?) ORDER BY id DESC LIMIT 300`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT id, method, path, status, total_ms, sql_ms, auth_ms, created_at FROM request_error_log WHERE created_at >= datetime('now','+8 hours', ?) ORDER BY id DESC LIMIT 200`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT path, COUNT(*) AS hit_count, ROUND(AVG(total_ms),1) AS avg_total_ms, MAX(total_ms) AS max_total_ms, ROUND(AVG(sql_ms),1) AS avg_sql_ms FROM slow_request_log WHERE created_at >= datetime('now','+8 hours', ?) GROUP BY path ORDER BY avg_total_ms DESC, hit_count DESC LIMIT 20`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT path, status, COUNT(*) AS hit_count FROM request_error_log WHERE created_at >= datetime('now','+8 hours', ?) GROUP BY path, status ORDER BY hit_count DESC, path ASC LIMIT 20`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT status, COUNT(*) AS c FROM request_error_log WHERE created_at >= datetime('now','+8 hours', ?) GROUP BY status`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT id, path, full_path, duration_ms, username, created_at FROM browser_perf_log WHERE created_at >= datetime('now','+8 hours', ?) ORDER BY id DESC LIMIT 200`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT path, COUNT(*) AS hit_count, ROUND(AVG(duration_ms),1) AS avg_duration_ms, MAX(duration_ms) AS max_duration_ms FROM browser_perf_log WHERE created_at >= datetime('now','+8 hours', ?) GROUP BY path ORDER BY avg_duration_ms DESC, hit_count DESC LIMIT 15`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT event_name, COUNT(*) AS hit_count, COUNT(DISTINCT path) AS path_count FROM browser_event_log WHERE created_at >= datetime('now','+8 hours', ?) GROUP BY event_name ORDER BY hit_count DESC, event_name ASC LIMIT 15`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT id, event_name, path, full_path, username, created_at, metadata_json FROM browser_event_log WHERE created_at >= datetime('now','+8 hours', ?) ORDER BY id DESC LIMIT 100`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS route_count, ROUND(AVG(duration_ms),1) AS avg_duration_ms, MAX(duration_ms) AS max_duration_ms FROM browser_perf_log WHERE created_at >= datetime('now','+8 hours', ?) GROUP BY substr(created_at,1,10) ORDER BY day DESC LIMIT 14`).bind(since).all<any>().catch(() => ({ results: [] })),
    getObservabilityRetentionPolicy(db).catch(() => ({ slow_request_days: 30, request_error_days: 30, browser_perf_days: 14, browser_event_days: 14 })),
    db.prepare(
      `SELECT path, total_ms
       FROM slow_request_log
       WHERE created_at >= datetime('now','+8 hours', ?)
         AND (path LIKE '/api/users%' OR path LIKE '/api/auth/me%' OR path LIKE '/api/jobs%')`
    ).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(
      `SELECT path, COUNT(*) AS c
       FROM request_error_log
       WHERE created_at >= datetime('now','+8 hours', ?)
         AND status >= 500
         AND (path LIKE '/api/users%' OR path LIKE '/api/auth/me%' OR path LIKE '/api/jobs%')
       GROUP BY path`
    ).bind(since).all<any>().catch(() => ({ results: [] })),
  ]);

  const slowRows = slowRowsRes.results || [];
  const errorRows = errorRowsRes.results || [];
  const totals = slowRows.map((row: any) => toSafeNumber(row?.total_ms)).filter((v) => v >= 0);
  const sqlTotals = slowRows.map((row: any) => toSafeNumber(row?.sql_ms)).filter((v) => v >= 0);
  const avg = totals.length ? Number((totals.reduce((sum, v) => sum + v, 0) / totals.length).toFixed(1)) : 0;
  const sqlAvg = sqlTotals.length ? Number((sqlTotals.reduce((sum, v) => sum + v, 0) / sqlTotals.length).toFixed(1)) : 0;
  const statuses = new Map<number, number>();
  for (const row of statusRes.results || []) statuses.set(toSafeNumber(row?.status), toSafeNumber(row?.c));
  const error4xx = Array.from(statuses.entries()).filter(([status]) => status >= 400 && status < 500).reduce((sum, [, c]) => sum + c, 0);
  const error5xx = Array.from(statuses.entries()).filter(([status]) => status >= 500).reduce((sum, [, c]) => sum + c, 0);

  const browserRouteRows = browserRouteRowsRes.results || [];
  const browserSummary = summarizeRouteDurations(browserRouteRows);
  const browserRecentRoutes = browserRouteRows.slice(0, 20);
  const browserRecentEvents = (browserRecentEventsRes.results || []).slice(0, 20).map((row: any) => {
    let metadata: Record<string, unknown> | null = null;
    try {
      metadata = row?.metadata_json ? JSON.parse(String(row.metadata_json)) : null;
    } catch {
      metadata = null;
    }
    return { ...row, metadata };
  });

  const endpoints = ['/api/users', '/api/auth/me', '/api/jobs'];
  const endpointTotals = new Map<string, number[]>();
  for (const endpoint of endpoints) endpointTotals.set(endpoint, []);
  for (const row of endpointRowsRes.results || []) {
    const path = String(row?.path || '');
    const endpoint = endpoints.find((item) => path.startsWith(item));
    if (!endpoint) continue;
    endpointTotals.get(endpoint)!.push(toSafeNumber(row?.total_ms));
  }
  const endpointError5xx = new Map<string, number>();
  for (const row of endpoint5xxRes.results || []) {
    const path = String(row?.path || '');
    const endpoint = endpoints.find((item) => path.startsWith(item));
    if (!endpoint) continue;
    endpointError5xx.set(endpoint, (endpointError5xx.get(endpoint) || 0) + toSafeNumber(row?.c));
  }
  const endpointBaselines = endpoints.map((endpoint) => {
    const totalsForEndpoint = endpointTotals.get(endpoint) || [];
    const avgTotalMs = totalsForEndpoint.length
      ? Number((totalsForEndpoint.reduce((sum, value) => sum + value, 0) / totalsForEndpoint.length).toFixed(1))
      : 0;
    return {
      endpoint,
      request_count: totalsForEndpoint.length,
      p50_total_ms: percentile(totalsForEndpoint, 50),
      p95_total_ms: percentile(totalsForEndpoint, 95),
      p99_total_ms: percentile(totalsForEndpoint, 99),
      avg_total_ms: avgTotalMs,
      error_5xx_count: endpointError5xx.get(endpoint) || 0,
    };
  });

  return {
    range_days: days,
    summary: {
      slow_count: slowRows.length,
      error_count: errorRows.length,
      avg_total_ms: avg,
      avg_sql_ms: sqlAvg,
      p50_total_ms: percentile(totals, 50),
      p95_total_ms: percentile(totals, 95),
      p99_total_ms: percentile(totals, 99),
      over_1000_ms: totals.filter((v) => v >= 1000).length,
      over_3000_ms: totals.filter((v) => v >= 3000).length,
      error_4xx: error4xx,
      error_5xx: error5xx,
    },
    top_slow_paths: topSlowRes.results || [],
    top_error_paths: topErrorRes.results || [],
    recent_slow_requests: slowRows,
    recent_error_requests: errorRows,
    browser_summary: browserSummary,
    browser_top_routes: browserTopRoutesRes.results || [],
    browser_recent_routes: browserRecentRoutes,
    browser_top_events: browserTopEventsRes.results || [],
    browser_recent_events: browserRecentEvents,
    daily_browser_trend: browserTrendRes.results || [],
    retention_policy: {
      slow_request_days: retentionPolicy.slow_request_days,
      request_error_days: retentionPolicy.request_error_days,
      browser_perf_days: retentionPolicy.browser_perf_days,
      browser_event_days: retentionPolicy.browser_event_days,
    },
    endpoint_baselines: endpointBaselines,
    index_recommendations: [
      { key: 'idx_asset_inventory_batch_kind_status_started', label: '盘点批次状态索引', status: 'ready', detail: '支撑当前批次/历史批次查询。' },
      { key: 'idx_pc_inventory_log_batch_id_asset_created', label: '电脑盘点记录批次索引', status: 'ready', detail: '支撑按批次回溯盘点记录与问题分布。' },
      { key: 'idx_monitor_inventory_log_batch_id_asset_created', label: '显示器盘点记录批次索引', status: 'ready', detail: '支撑显示器盘点历史与问题统计。' },
      { key: 'idx_browser_perf_log_path_duration_created', label: '浏览器路由性能复合索引', status: 'recommended', detail: '支撑按路径统计平均耗时与慢页面排行。' },
      { key: 'idx_browser_event_log_path_event_created', label: '浏览器事件复合索引', status: 'recommended', detail: '支撑按路径和事件名称查看交互热点。' },
    ],
  };
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requirePermission(env, request, 'ops_tools', 'viewer');
    const url = new URL(request.url);
    const days = Math.max(1, Math.min(30, Number(url.searchParams.get('days') || 7) || 7));
    const force = url.searchParams.get('force') === '1';
    const key = `perf:${days}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (!force && hit?.value && hit.expiresAt > now) return json(true, hit.value);
    if (!force && hit?.pending) return json(true, await hit.pending);
    const pending = loadPerfPayload(env.DB, days).then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    }).finally(() => {
      const latest = cache.get(key);
      if (latest?.pending) latest.pending = undefined;
    });
    cache.set(key, { value: hit?.value, expiresAt: hit?.expiresAt || 0, pending });
    return json(true, await pending);
  } catch (e: any) {
    return errorResponse(e);
  }
};
