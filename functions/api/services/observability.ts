import { sqlNowStored } from '../_time';
import { ensureRequestErrorLogTable, ensureSlowRequestLogTable } from './ops-tools';

export type ObservabilityRetentionPolicy = {
  slow_request_days: number;
  request_error_days: number;
  browser_perf_days: number;
  browser_event_days: number;
};

export type BrowserPerfSummary = {
  slow_route_count: number;
  p95_duration_ms: number;
  p99_duration_ms: number;
  avg_duration_ms: number;
};

export type ObservabilityCleanupRun = {
  deleted_slow_request_rows: number;
  deleted_request_error_rows: number;
  deleted_browser_perf_rows: number;
  deleted_browser_event_rows: number;
};

export const DEFAULT_OBSERVABILITY_RETENTION_POLICY: ObservabilityRetentionPolicy = {
  slow_request_days: 30,
  request_error_days: 30,
  browser_perf_days: 14,
  browser_event_days: 14,
};

export function clampRetentionDays(value: unknown, fallback: number, min = 1, max = 365): number {
  const num = Math.trunc(Number(value));
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx] || 0);
}

export function summarizeRouteDurations(rows: Array<{ duration_ms?: number | null }>): BrowserPerfSummary {
  const totals = rows
    .map((row) => Number(row?.duration_ms || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const avg = totals.length ? Number((totals.reduce((sum, value) => sum + value, 0) / totals.length).toFixed(1)) : 0;
  return {
    slow_route_count: totals.filter((value) => value >= 1600).length,
    avg_duration_ms: avg,
    p95_duration_ms: percentile(totals, 95),
    p99_duration_ms: percentile(totals, 99),
  };
}

export async function ensureBrowserObservabilityTables(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS browser_perf_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL DEFAULT 'route',
      path TEXT NOT NULL,
      full_path TEXT,
      duration_ms INTEGER NOT NULL,
      username TEXT,
      created_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_perf_log_created_at ON browser_perf_log(created_at DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_perf_log_path_created_at ON browser_perf_log(path, created_at DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_perf_log_duration_created_at ON browser_perf_log(duration_ms DESC, created_at DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_perf_log_path_duration_created ON browser_perf_log(path, duration_ms DESC, created_at DESC)`).run();

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS browser_event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_name TEXT NOT NULL,
      path TEXT NOT NULL,
      full_path TEXT,
      metadata_json TEXT,
      username TEXT,
      created_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_event_log_created_at ON browser_event_log(created_at DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_event_log_event_created_at ON browser_event_log(event_name, created_at DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_event_log_path_created_at ON browser_event_log(path, created_at DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_event_log_path_event_created ON browser_event_log(path, event_name, created_at DESC)`).run();
}

export async function ensureObservabilityRetentionTables(db: D1Database) {
  await ensureSlowRequestLogTable(db);
  await ensureRequestErrorLogTable(db);
  await ensureBrowserObservabilityTables(db);
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS observability_retention_policy (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      slow_request_days INTEGER NOT NULL DEFAULT 30,
      request_error_days INTEGER NOT NULL DEFAULT 30,
      browser_perf_days INTEGER NOT NULL DEFAULT 14,
      browser_event_days INTEGER NOT NULL DEFAULT 14,
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  await db.prepare(
    `INSERT INTO observability_retention_policy (id, slow_request_days, request_error_days, browser_perf_days, browser_event_days, updated_at)
     VALUES (1, ?, ?, ?, ?, ${sqlNowStored()})
     ON CONFLICT(id) DO NOTHING`
  ).bind(
    DEFAULT_OBSERVABILITY_RETENTION_POLICY.slow_request_days,
    DEFAULT_OBSERVABILITY_RETENTION_POLICY.request_error_days,
    DEFAULT_OBSERVABILITY_RETENTION_POLICY.browser_perf_days,
    DEFAULT_OBSERVABILITY_RETENTION_POLICY.browser_event_days,
  ).run();
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS observability_cleanup_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_reason TEXT NOT NULL DEFAULT 'manual',
      deleted_slow_request_rows INTEGER NOT NULL DEFAULT 0,
      deleted_request_error_rows INTEGER NOT NULL DEFAULT 0,
      deleted_browser_perf_rows INTEGER NOT NULL DEFAULT 0,
      deleted_browser_event_rows INTEGER NOT NULL DEFAULT 0,
      policy_json TEXT,
      created_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_observability_cleanup_runs_created_at ON observability_cleanup_runs(created_at DESC, id DESC)`).run();
}

export async function getObservabilityRetentionPolicy(db: D1Database): Promise<ObservabilityRetentionPolicy> {
  await ensureObservabilityRetentionTables(db);
  const row = await db.prepare(
    `SELECT slow_request_days, request_error_days, browser_perf_days, browser_event_days
     FROM observability_retention_policy WHERE id = 1`
  ).first<any>();
  return {
    slow_request_days: clampRetentionDays(row?.slow_request_days, DEFAULT_OBSERVABILITY_RETENTION_POLICY.slow_request_days),
    request_error_days: clampRetentionDays(row?.request_error_days, DEFAULT_OBSERVABILITY_RETENTION_POLICY.request_error_days),
    browser_perf_days: clampRetentionDays(row?.browser_perf_days, DEFAULT_OBSERVABILITY_RETENTION_POLICY.browser_perf_days),
    browser_event_days: clampRetentionDays(row?.browser_event_days, DEFAULT_OBSERVABILITY_RETENTION_POLICY.browser_event_days),
  };
}

export async function runObservabilityCleanup(db: D1Database, options?: { reason?: string; policy?: Partial<ObservabilityRetentionPolicy> }) {
  await ensureObservabilityRetentionTables(db);
  const current = await getObservabilityRetentionPolicy(db);
  const policy: ObservabilityRetentionPolicy = {
    slow_request_days: clampRetentionDays(options?.policy?.slow_request_days, current.slow_request_days),
    request_error_days: clampRetentionDays(options?.policy?.request_error_days, current.request_error_days),
    browser_perf_days: clampRetentionDays(options?.policy?.browser_perf_days, current.browser_perf_days),
    browser_event_days: clampRetentionDays(options?.policy?.browser_event_days, current.browser_event_days),
  };

  const [slowCount, errorCount, perfCount, eventCount] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS c FROM slow_request_log WHERE created_at < datetime('now','+8 hours', ?)` ).bind(`-${policy.slow_request_days} day`).first<any>(),
    db.prepare(`SELECT COUNT(*) AS c FROM request_error_log WHERE created_at < datetime('now','+8 hours', ?)` ).bind(`-${policy.request_error_days} day`).first<any>(),
    db.prepare(`SELECT COUNT(*) AS c FROM browser_perf_log WHERE created_at < datetime('now','+8 hours', ?)` ).bind(`-${policy.browser_perf_days} day`).first<any>(),
    db.prepare(`SELECT COUNT(*) AS c FROM browser_event_log WHERE created_at < datetime('now','+8 hours', ?)` ).bind(`-${policy.browser_event_days} day`).first<any>(),
  ]);

  await db.batch([
    db.prepare(`DELETE FROM slow_request_log WHERE created_at < datetime('now','+8 hours', ?)` ).bind(`-${policy.slow_request_days} day`),
    db.prepare(`DELETE FROM request_error_log WHERE created_at < datetime('now','+8 hours', ?)` ).bind(`-${policy.request_error_days} day`),
    db.prepare(`DELETE FROM browser_perf_log WHERE created_at < datetime('now','+8 hours', ?)` ).bind(`-${policy.browser_perf_days} day`),
    db.prepare(`DELETE FROM browser_event_log WHERE created_at < datetime('now','+8 hours', ?)` ).bind(`-${policy.browser_event_days} day`),
    db.prepare(
      `INSERT INTO observability_cleanup_runs (
        run_reason,
        deleted_slow_request_rows,
        deleted_request_error_rows,
        deleted_browser_perf_rows,
        deleted_browser_event_rows,
        policy_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ${sqlNowStored()})`
    ).bind(
      String(options?.reason || 'manual').slice(0, 40),
      Number(slowCount?.c || 0),
      Number(errorCount?.c || 0),
      Number(perfCount?.c || 0),
      Number(eventCount?.c || 0),
      JSON.stringify(policy),
    ),
    db.prepare(
      `UPDATE observability_retention_policy
       SET slow_request_days=?, request_error_days=?, browser_perf_days=?, browser_event_days=?, updated_at=${sqlNowStored()}
       WHERE id = 1`
    ).bind(policy.slow_request_days, policy.request_error_days, policy.browser_perf_days, policy.browser_event_days),
  ]);

  return {
    policy,
    deleted_slow_request_rows: Number(slowCount?.c || 0),
    deleted_request_error_rows: Number(errorCount?.c || 0),
    deleted_browser_perf_rows: Number(perfCount?.c || 0),
    deleted_browser_event_rows: Number(eventCount?.c || 0),
  } satisfies ObservabilityCleanupRun & { policy: ObservabilityRetentionPolicy };
}
