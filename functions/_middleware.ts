import { createTiming } from "./api/_timing";

// Global middleware for Cloudflare Pages Functions
// - Adds Server-Timing to all /api responses
// - Wraps D1 so all queries are accumulated into `sql` timing bucket
// - Logs slow requests (best-effort) into D1

function wrapD1(db: D1Database, t: ReturnType<typeof createTiming>): D1Database {
  // Wrap statement methods to accumulate sql time.
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
        return v.bind(target);
      },
    });
  }

  return new Proxy(db as any, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (prop === "prepare" && typeof v === "function") {
        return (sql: string) => wrapStmt(v.call(target, sql));
      }
      return v;
    },
  }) as any;
}

async function logSlowRequest(context: any, t: ReturnType<typeof createTiming>, response: Response) {
  try {
    const env = context.env as any;
    const db: D1Database | undefined = env?.DB;
    if (!db) return;

    const threshold = Number(env.SLOW_REQUEST_MS || 800);
    const total = t.totalMs();
    if (!(total >= threshold)) return;

    const url = new URL(context.request.url);
    const path = url.pathname;
    if (!path.startsWith("/api/")) return;

    // best-effort user id
    const userId = (() => {
      const u = (context.data && (context.data as any).user) || null;
      const id = u?.id;
      return id ? Number(id) : null;
    })();

    const method = context.request.method;
    const status = response.status;
    const colo = context?.cf?.colo || null;
    const country = context?.cf?.country || null;

    const authMs = Number((t.parts as any).auth || 0);
    const sqlMs = Number((t.parts as any).sql || 0);

    const q = url.search;

    const doInsert = async () => {
      await db
        .prepare(
          `INSERT INTO api_slow_requests (method, path, query, status, dur_ms, auth_ms, sql_ms, colo, country, user_id)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        )
        .bind(method, path, q || null, status, total, authMs, sqlMs, colo, country, userId)
        .run();
    };

    if (typeof context.waitUntil === "function") context.waitUntil(doInsert());
    else await doInsert();
  } catch {
    // never block response
  }
}

export async function onRequest(context: any) {
  const url = new URL(context.request.url);
  const isApi = url.pathname.startsWith("/api/");

  const t = createTiming();
  // expose timing to helpers (e.g. requireAuth)
  const envAny = context.env as any;
  envAny.__timing = t;
  // 每次请求清空一次（避免跨请求残留）
  envAny.__refresh_token = null;
  if (isApi && envAny.DB) {
    envAny.DB = wrapD1(envAny.DB, t);
  }

  let res: Response;
  try {
    res = await context.next();
  } finally {
    // noop
  }

  if (isApi) {
    const headers = new Headers(res.headers);
    headers.set("Server-Timing", t.header());

    // 滑动续期：requireAuth 成功时会把新 token 写到 env.__refresh_token
    const newToken = envAny.__refresh_token;
    if (newToken && res.status !== 401) {
      headers.set("X-Auth-Token", String(newToken));
    }

    res = new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    await logSlowRequest(context, t, res);
  }

  return res;
}
