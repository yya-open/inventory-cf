import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';

type Sample = {
  kind?: string;
  path?: string;
  fullPath?: string;
  duration_ms?: number;
  ts?: number;
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
    })();
  }
  await ensured;
}

function normalizeSample(input: Sample) {
  const path = String(input?.path || '').trim();
  const fullPath = String(input?.fullPath || '').trim();
  const kind = String(input?.kind || 'route').trim() || 'route';
  const duration = Math.round(Number(input?.duration_ms || 0));
  if (!path || !Number.isFinite(duration) || duration <= 0) return null;
  return {
    kind,
    path: path.slice(0, 180),
    fullPath: (fullPath || path).slice(0, 500),
    duration,
  };
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET?: string }> = async ({ env, request }) => {
  try {
    const user = await requirePermission(env, request, 'ops_tools', 'viewer').catch(() => null);
    await ensureTable(env.DB);
    const body = await request.json().catch(() => ({} as any));
    const rawSamples = Array.isArray(body?.samples) ? body.samples : [];
    const samples = rawSamples.map(normalizeSample).filter(Boolean).slice(0, 20) as Array<ReturnType<typeof normalizeSample> & {}>;
    if (!samples.length) return json(true, { inserted: 0 });
    const stmts = samples.map((sample) => env.DB.prepare(
      `INSERT INTO browser_perf_log (kind, path, full_path, duration_ms, username)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(sample.kind, sample.path, sample.fullPath, sample.duration, user?.username || null));
    await env.DB.batch(stmts);
    return json(true, { inserted: stmts.length });
  } catch (e: any) {
    return errorResponse(e);
  }
};
