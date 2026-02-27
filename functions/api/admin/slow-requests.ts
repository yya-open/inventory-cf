import { requireAuth, errorResponse } from "../../_auth";

// View recent slow requests logged by functions/_middleware.ts
// Admin-only.
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 100)));
    const path = (url.searchParams.get("path") || "").trim();

    const wh: string[] = [];
    const binds: any[] = [];
    if (path) {
      wh.push("path LIKE ?");
      binds.push(path.includes("%") ? path : `%${path}%`);
    }
    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

    const { results } = await env.DB
      .prepare(
        `SELECT id, created_at, method, path, query, status, dur_ms, auth_ms, sql_ms, colo, country, user_id
         FROM api_slow_requests
         ${where}
         ORDER BY id DESC
         LIMIT ?`
      )
      .bind(...binds, limit)
      .all();

    return Response.json({ ok: true, data: results });
  } catch (e: any) {
    return errorResponse(e);
  }
};
