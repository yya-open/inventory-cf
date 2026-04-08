import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';

type Sample = {
  kind?: string;
  path?: string;
  fullPath?: string;
  duration_ms?: number;
  event_name?: string;
  metadata?: Record<string, unknown> | null;
  ts?: number;
};

type RouteSample = {
  kind: 'route';
  path: string;
  fullPath: string;
  duration: number;
};

type EventSample = {
  kind: 'event';
  path: string;
  fullPath: string;
  eventName: string;
  metadataJson: string | null;
};

let ensured: Promise<void> | null = null;
async function ensureTable(db: D1Database) {
  if (!ensured) {
    ensured = (async () => {
      await db.prepare(
        `CREATE TABLE IF NOT EXISTS browser_perf_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kind TEXT NOT NULL DEFAULT 'route',
          path TEXT NOT NULL,
          full_path TEXT,
          duration_ms INTEGER NOT NULL,
          username TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
        )`
      ).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_perf_log_created_at ON browser_perf_log(created_at DESC)`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_perf_log_path_created_at ON browser_perf_log(path, created_at DESC)`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_perf_log_duration_created_at ON browser_perf_log(duration_ms DESC, created_at DESC)`).run();
      await db.prepare(
        `CREATE TABLE IF NOT EXISTS browser_event_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_name TEXT NOT NULL,
          path TEXT NOT NULL,
          full_path TEXT,
          metadata_json TEXT,
          username TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
        )`
      ).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_event_log_created_at ON browser_event_log(created_at DESC)`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_event_log_event_created_at ON browser_event_log(event_name, created_at DESC)`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_browser_event_log_path_created_at ON browser_event_log(path, created_at DESC)`).run();
    })();
  }
  await ensured;
}

function normalizePath(input: unknown, fallback = '/') {
  const value = String(input || '').trim();
  return (value || fallback).slice(0, 500);
}

function normalizeSample(input: Sample): RouteSample | EventSample | null {
  const path = normalizePath(input?.path, '/').slice(0, 180);
  const fullPath = normalizePath(input?.fullPath, path);
  const kind = String(input?.kind || 'route').trim().toLowerCase();
  if (kind === 'event') {
    const eventName = String(input?.event_name || '').trim();
    if (!eventName) return null;
    let metadataJson: string | null = null;
    try {
      if (input?.metadata && typeof input.metadata === 'object') {
        metadataJson = JSON.stringify(input.metadata).slice(0, 2000);
      }
    } catch {
      metadataJson = null;
    }
    return { kind: 'event', path, fullPath, eventName: eventName.slice(0, 80), metadataJson };
  }
  const duration = Math.round(Number(input?.duration_ms || 0));
  if (!path || !Number.isFinite(duration) || duration <= 0) return null;
  return { kind: 'route', path, fullPath, duration };
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET?: string }> = async ({ env, request }) => {
  try {
    const user = await requirePermission(env, request, 'ops_tools', 'viewer').catch(() => null);
    await ensureTable(env.DB);
    const body = await request.json().catch(() => ({} as any));
    const rawSamples = Array.isArray(body?.samples) ? body.samples : [];
    const samples = rawSamples.map(normalizeSample).filter(Boolean).slice(0, 20) as Array<RouteSample | EventSample>;
    if (!samples.length) return json(true, { inserted: 0, route_inserted: 0, event_inserted: 0 });
    const stmts = samples.map((sample) => {
      if (sample.kind === 'event') {
        return env.DB.prepare(
          `INSERT INTO browser_event_log (event_name, path, full_path, metadata_json, username)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(sample.eventName, sample.path, sample.fullPath, sample.metadataJson, user?.username || null);
      }
      return env.DB.prepare(
        `INSERT INTO browser_perf_log (kind, path, full_path, duration_ms, username)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(sample.kind, sample.path, sample.fullPath, sample.duration, user?.username || null);
    });
    await env.DB.batch(stmts);
    const routeInserted = samples.filter((sample) => sample.kind === 'route').length;
    const eventInserted = samples.length - routeInserted;
    return json(true, { inserted: stmts.length, route_inserted: routeInserted, event_inserted: eventInserted });
  } catch (e: any) {
    return errorResponse(e);
  }
};
