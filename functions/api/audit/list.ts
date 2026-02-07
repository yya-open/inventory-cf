import { requireAuth, errorResponse } from "../../_auth";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    const url = new URL(request.url);

    const keyword = (url.searchParams.get("keyword") || "").trim();
    const action = (url.searchParams.get("action") || "").trim();
    const entity = (url.searchParams.get("entity") || "").trim();
    const user = (url.searchParams.get("user") || "").trim();
    const date_from = url.searchParams.get("date_from");
    const date_to = url.searchParams.get("date_to");

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
    const offset = (page - 1) * pageSize;

    const wh: string[] = [];
    const binds: any[] = [];

    if (keyword) {
      wh.push("(username LIKE ? OR action LIKE ? OR entity LIKE ? OR entity_id LIKE ?)");
      binds.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (action) { wh.push("action=?"); binds.push(action); }
    if (entity) { wh.push("entity=?"); binds.push(entity); }
    if (user) { wh.push("username=?"); binds.push(user); }
    if (date_from) { wh.push("created_at >= ?"); binds.push(date_from); }
    if (date_to) { wh.push("created_at <= ?"); binds.push(date_to); }

    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

    const totalRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM audit_log ${where}`).bind(...binds).first<any>();

    const { results } = await env.DB.prepare(
      `SELECT id, created_at, username, action, entity, entity_id, ip, ua, payload_json
       FROM audit_log
       ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`
    ).bind(...binds, pageSize, offset).all();

    return Response.json({ ok: true, data: results, total: Number(totalRow?.c || 0), page, pageSize });
  } catch (e: any) {
    return errorResponse(e);
  }
};
