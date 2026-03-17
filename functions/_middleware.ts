import { sqlNowStored } from "./api/_time";
import { createTiming } from "./api/_timing";
import { buildAuthCookie, buildClearAuthCookie } from "./_auth";

function wrapD1(db: D1Database, t: ReturnType<typeof createTiming>): D1Database {
  function wrapStmt(stmt: any) {
    if (!stmt) return stmt;
    return new Proxy(stmt, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (typeof v !== "function") return v;
        if (prop === "all" || prop === "first" || prop === "run" || prop === "raw") {
          return async (...args: any[]) => {
            const s = Date.now();
            try {
              return await v.apply(target, args);
            } finally {
              t.add("sql", Date.now() - s);
            }
          };
        }
        if (prop === "bind") {
          return (...args: any[]) => wrapStmt(v.apply(target, args));
        }
        return v.bind(target);
      },
    }) as any;
  }

  return new Proxy(db, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== "function") return v;
      if (prop === "prepare") {
        return (...args: any[]) => wrapStmt(v.apply(target, args));
      }
      if (prop === "batch") {
        return async (stmts: any[]) => {
          const s = Date.now();
          try {
            return await v.apply(target, [stmts]);
          } finally {
            t.add("sql", Date.now() - s);
          }
        };
      }
      if (prop === "exec") {
        return async (...args: any[]) => {
          const s = Date.now();
          try {
            return await v.apply(target, args);
          } finally {
            t.add("sql", Date.now() - s);
          }
        };
      }
      return v.bind(target);
    },
  }) as any;
}

async function logSlowRequest(context: any, t: ReturnType<typeof createTiming>, res: Response) {
  try {
    const total = t.total();
    const thresholdMs = Number((context.env as any)?.SLOW_REQUEST_MS || 1200);
    if (!Number.isFinite(total) || total < thresholdMs) return;
    const db = (context.env as any)?.DB as D1Database | undefined;
    if (!db) return;

    const url = new URL(context.request.url);
    const method = context.request.method;
    const path = url.pathname + (url.search || "");
    const status = res.status;
    const sqlMs = Math.round(t.get("sql") || 0);
    const authMs = Math.round(t.get("auth") || 0);
    const totalMs = Math.round(total);

    const doInsert = async () => {
      try {
        await db.prepare(
          `INSERT INTO slow_request_log (method, path, status, total_ms, sql_ms, auth_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ${sqlNowStored()})`
        )
          .bind(method, path, status, totalMs, sqlMs, authMs)
          .run();
      } catch {
        await db.prepare(
          `CREATE TABLE IF NOT EXISTS slow_request_log (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             method TEXT,
             path TEXT,
             status INTEGER,
             total_ms INTEGER,
             sql_ms INTEGER,
             auth_ms INTEGER,
             created_at TEXT DEFAULT (${sqlNowStored()})
           )`
        ).run();
        await db.prepare(
          `INSERT INTO slow_request_log (method, path, status, total_ms, sql_ms, auth_ms, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ${sqlNowStored()})`
        )
          .bind(method, path, status, totalMs, sqlMs, authMs)
          .run();
      }
    };

    if (typeof context.waitUntil === "function") context.waitUntil(doInsert());
    else await doInsert();
  } catch {}
}

export async function onRequest(context: any) {
  const url = new URL(context.request.url);
  const isApi = url.pathname.startsWith("/api/");

  const t = createTiming();
  const envAny = context.env as any;
  envAny.__timing = t;
  envAny.__refresh_token = null;
  envAny.__clear_auth_cookie = false;
  if (isApi && envAny.DB) {
    envAny.DB = wrapD1(envAny.DB, t);
  }

  let res: Response;
  try {
    res = await context.next();
  } finally {}

  if (isApi) {
    const headers = new Headers(res.headers);
    headers.set("Server-Timing", t.header());

    const newToken = envAny.__refresh_token;
    if (newToken && res.status !== 401) {
      headers.append("Set-Cookie", buildAuthCookie(String(newToken)));
    }
    if (envAny.__clear_auth_cookie || res.status === 401) {
      headers.append("Set-Cookie", buildClearAuthCookie());
    }

    res = new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    await logSlowRequest(context, t, res);
  }

  return res;
}
