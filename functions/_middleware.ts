import { sqlNowStored } from "./api/_time";
import { createTiming } from "./api/_timing";
import { buildAuthCookie, buildClearAuthCookie, getJwtTtlSeconds } from "./_auth";

type Timing = ReturnType<typeof createTiming>;
type WrappedStmt = D1PreparedStatement;

type MiddlewareEnv = {
  DB?: D1Database;
  DEBUG_SQL?: string | number | null;
  SLOW_REQUEST_MS?: string | number | null;
  SLOW_REQUEST_SAMPLE_RATE?: string | number | null;
  ERROR_REQUEST_SAMPLE_RATE?: string | number | null;
  JWT_TTL_SECONDS?: string | number | null;
  __timing?: Timing;
  __refresh_token?: string | null;
  __clear_auth_cookie?: boolean;
};

type MiddlewareContext = EventContext<MiddlewareEnv>;

function isDebugSqlEnabled(env: MiddlewareEnv) {
  return String(env.DEBUG_SQL ?? '').trim() === '1' || String(env.DEBUG_SQL ?? '').trim().toLowerCase() === 'true';
}

function clampRate(value: unknown, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function shouldSample(value: unknown, fallback = 1) {
  const rate = clampRate(value, fallback);
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return Math.random() < rate;
}

function wrapD1(db: D1Database, t: Timing): D1Database {
  function wrapStmt(stmt: WrappedStmt | null | undefined): WrappedStmt | null | undefined {
    if (!stmt) return stmt;
    return new Proxy(stmt, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver) as unknown;
        if (typeof value !== 'function') return value;
        if (prop === 'all' || prop === 'first' || prop === 'run' || prop === 'raw') {
          return async (...args: unknown[]) => {
            const started = Date.now();
            try {
              return await (value as (...innerArgs: unknown[]) => Promise<unknown>).apply(target, args);
            } finally {
              t.add('sql', Date.now() - started);
            }
          };
        }
        if (prop === 'bind') {
          return (...args: unknown[]) => wrapStmt((value as (...innerArgs: unknown[]) => WrappedStmt).apply(target, args));
        }
        return (value as Function).bind(target);
      },
    }) as WrappedStmt;
  }

  return new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== 'function') return value;
      if (prop === 'prepare') {
        return (...args: unknown[]) => wrapStmt((value as (...innerArgs: unknown[]) => WrappedStmt).apply(target, args));
      }
      if (prop === 'batch') {
        return async (stmts: WrappedStmt[]) => {
          const started = Date.now();
          try {
            return await (value as (inner: WrappedStmt[]) => Promise<unknown>).apply(target, [stmts]);
          } finally {
            t.add('sql', Date.now() - started);
          }
        };
      }
      if (prop === 'exec') {
        return async (...args: unknown[]) => {
          const started = Date.now();
          try {
            return await (value as (...innerArgs: unknown[]) => Promise<unknown>).apply(target, args);
          } finally {
            t.add('sql', Date.now() - started);
          }
        };
      }
      return (value as Function).bind(target);
    },
  }) as D1Database;
}

async function logErrorRequest(context: MiddlewareContext, t: Timing, res: Response) {
  try {
    if (res.status < 500) return;
    const db = context.env.DB;
    if (!db || !shouldSample(context.env.ERROR_REQUEST_SAMPLE_RATE, 1)) return;
    const url = new URL(context.request.url);
    await db.prepare(
      `INSERT INTO request_error_log (method, path, status, total_ms, sql_ms, auth_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ${sqlNowStored()})`
    ).bind(
      context.request.method,
      url.pathname + (url.search || ''),
      res.status,
      Math.round(t.total() || 0),
      Math.round(t.get('sql') || 0),
      Math.round(t.get('auth') || 0),
    ).run();
  } catch {
    // ignore best-effort error logging
  }
}

async function logSlowRequest(context: MiddlewareContext, t: Timing, res: Response) {
  try {
    const total = t.total();
    const thresholdMs = Number(context.env.SLOW_REQUEST_MS || 1200);
    if (!Number.isFinite(total) || total < thresholdMs) return;
    const db = context.env.DB;
    if (!db || !shouldSample(context.env.SLOW_REQUEST_SAMPLE_RATE, 1)) return;
    const url = new URL(context.request.url);
    await db.prepare(
      `INSERT INTO slow_request_log (method, path, status, total_ms, sql_ms, auth_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ${sqlNowStored()})`
    ).bind(
      context.request.method,
      url.pathname + (url.search || ''),
      res.status,
      Math.round(total),
      Math.round(t.get('sql') || 0),
      Math.round(t.get('auth') || 0),
    ).run();
  } catch {
    // ignore best-effort slow logging
  }
}

export async function onRequest(context: MiddlewareContext) {
  const url = new URL(context.request.url);
  const isApi = url.pathname.startsWith('/api/');

  const t = createTiming();
  context.env.__timing = t;
  context.env.__refresh_token = null;
  context.env.__clear_auth_cookie = false;
  if (isApi && context.env.DB && isDebugSqlEnabled(context.env)) {
    context.env.DB = wrapD1(context.env.DB, t);
  }

  let res = await context.next();

  if (isApi) {
    const headers = new Headers(res.headers);
    headers.set('Server-Timing', t.header());

    const newToken = context.env.__refresh_token;
    if (newToken && res.status !== 401) {
      headers.append('Set-Cookie', buildAuthCookie(String(newToken), getJwtTtlSeconds(context.env)));
    }
    if (context.env.__clear_auth_cookie || res.status === 401) {
      headers.append('Set-Cookie', buildClearAuthCookie());
    }

    res = new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    const slowTask = logSlowRequest(context, t, res);
    const errorTask = logErrorRequest(context, t, res);
    if (typeof context.waitUntil === 'function') {
      context.waitUntil(Promise.allSettled([slowTask, errorTask]).then(() => undefined));
    } else {
      await Promise.allSettled([slowTask, errorTask]);
    }
  }

  return res;
}
