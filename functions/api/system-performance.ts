import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';
import { ensureRequestErrorLogTable, ensureSlowRequestLogTable } from './services/ops-tools';

let browserPerfEnsured: Promise<void> | null = null;
async function ensureBrowserPerfTable(db: D1Database) {
  if (!browserPerfEnsured) {
    browserPerfEnsured = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS browser_perf_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL DEFAULT 'route',
        path TEXT NOT NULL,
        full_path TEXT,
        duration_ms INTEGER NOT NULL,
        username TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
      )`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_perf_log_created_at ON browser_perf_log(created_at DESC)`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_perf_log_path_created_at ON browser_perf_log(path, created_at DESC)`).run();
    })();
  }
  await browserPerfEnsured;
}

type PerfPayload = {
  range_days: number;
  summary: Record<string, number>;
  top_slow_paths: any[];
  top_p95_paths: any[];
  top_error_paths: any[];
  recent_slow_requests: any[];
  recent_error_requests: any[];
  top_browser_routes: any[];
  top_browser_p95_routes: any[];
  recent_browser_routes: any[];
};

type CacheEntry = { expiresAt: number; value?: PerfPayload; pending?: Promise<PerfPayload> };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30_000;

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx] || 0);
}

async function loadPerfPayload(db: D1Database, days: number): Promise<PerfPayload> {
  await Promise.all([ensureSlowRequestLogTable(db), ensureRequestErrorLogTable(db), ensureBrowserPerfTable(db)]);
  const since = `-${days} day`;
  const [slowRowsRes, errorRowsRes, topSlowRes, topP95Res, topErrorRes, statusRes, browserTopRes, browserP95Res, browserRecentRes] = await Promise.all([
    db.prepare(`SELECT id, method, path, status, total_ms, sql_ms, auth_ms, created_at FROM slow_request_log WHERE created_at >= datetime('now','+8 hours', ?) ORDER BY id DESC LIMIT 300`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT id, method, path, status, total_ms, sql_ms, auth_ms, created_at FROM request_error_log WHERE created_at >= datetime('now','+8 hours', ?) ORDER BY id DESC LIMIT 200`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT path, COUNT(*) AS hit_count, ROUND(AVG(total_ms),1) AS avg_total_ms, MAX(total_ms) AS max_total_ms, ROUND(AVG(sql_ms),1) AS avg_sql_ms FROM slow_request_log WHERE created_at >= datetime('now','+8 hours', ?) GROUP BY path ORDER BY avg_total_ms DESC, hit_count DESC LIMIT 20`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT path, COUNT(*) AS hit_count, MAX(total_ms) AS p95_total_ms FROM (
      SELECT path, total_ms, NTILE(20) OVER (PARTITION BY path ORDER BY total_ms) AS bucket
      FROM slow_request_log
      WHERE created_at >= datetime('now','+8 hours', ?)
    ) t WHERE bucket = 19 OR bucket = 20 GROUP BY path ORDER BY p95_total_ms DESC, hit_count DESC LIMIT 20`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT path, status, COUNT(*) AS hit_count FROM request_error_log WHERE created_at >= datetime('now','+8 hours', ?) GROUP BY path, status ORDER BY hit_count DESC, path ASC LIMIT 20`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT status, COUNT(*) AS c FROM request_error_log WHERE created_at >= datetime('now','+8 hours', ?) GROUP BY status`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT path, COUNT(*) AS hit_count, ROUND(AVG(duration_ms),1) AS avg_duration_ms, MAX(duration_ms) AS max_duration_ms FROM browser_perf_log WHERE created_at >= datetime('now','+8 hours', ?) GROUP BY path ORDER BY avg_duration_ms DESC, hit_count DESC LIMIT 20`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT path, COUNT(*) AS hit_count, MAX(duration_ms) AS p95_duration_ms FROM (
      SELECT path, duration_ms, NTILE(20) OVER (PARTITION BY path ORDER BY duration_ms) AS bucket
      FROM browser_perf_log
      WHERE created_at >= datetime('now','+8 hours', ?)
    ) t WHERE bucket = 19 OR bucket = 20 GROUP BY path ORDER BY p95_duration_ms DESC, hit_count DESC LIMIT 20`).bind(since).all<any>().catch(() => ({ results: [] })),
    db.prepare(`SELECT created_at, path, full_path, duration_ms, username FROM browser_perf_log WHERE created_at >= datetime('now','+8 hours', ?) ORDER BY id DESC LIMIT 100`).bind(since).all<any>().catch(() => ({ results: [] })),
  ]);

  const slowRows = slowRowsRes.results || [];
  const errorRows = errorRowsRes.results || [];
  const totals = slowRows.map((row: any) => Number(row?.total_ms || 0)).filter((v) => Number.isFinite(v) && v >= 0);
  const sqlTotals = slowRows.map((row: any) => Number(row?.sql_ms || 0)).filter((v) => Number.isFinite(v) && v >= 0);
  const avg = totals.length ? Number((totals.reduce((sum, v) => sum + v, 0) / totals.length).toFixed(1)) : 0;
  const sqlAvg = sqlTotals.length ? Number((sqlTotals.reduce((sum, v) => sum + v, 0) / sqlTotals.length).toFixed(1)) : 0;
  const statuses = new Map<number, number>();
  for (const row of statusRes.results || []) statuses.set(Number(row?.status || 0), Number(row?.c || 0));
  const error4xx = Array.from(statuses.entries()).filter(([status]) => status >= 400 && status < 500).reduce((sum, [, c]) => sum + c, 0);
  const error5xx = Array.from(statuses.entries()).filter(([status]) => status >= 500).reduce((sum, [, c]) => sum + c, 0);

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
    top_p95_paths: topP95Res.results || [],
    top_error_paths: topErrorRes.results || [],
    recent_slow_requests: slowRows,
    recent_error_requests: errorRows,
    top_browser_routes: browserTopRes.results || [],
    top_browser_p95_routes: browserP95Res.results || [],
    recent_browser_routes: browserRecentRes.results || [],
  };
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requirePermission(env, request, 'ops_tools', 'admin');
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
