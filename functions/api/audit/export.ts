import { requireAuth, errorResponse } from "../../_auth";

function csvEscape(v: any) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Escape quotes by doubling them; wrap in quotes if needed.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

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

    const limit = Math.min(50000, Math.max(1000, Number(url.searchParams.get("limit") || 10000)));

    const wh: string[] = [];
    const binds: any[] = [];

    if (keyword) {
      wh.push("(a.username LIKE ? OR a.action LIKE ? OR a.entity LIKE ? OR a.entity_id LIKE ?)");
      binds.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (action) { wh.push("a.action=?"); binds.push(action); }
    if (entity) { wh.push("a.entity=?"); binds.push(entity); }
    if (user) { wh.push("a.username=?"); binds.push(user); }
    if (date_from) { wh.push("a.created_at >= ?"); binds.push(date_from); }
    if (date_to) { wh.push("a.created_at <= ?"); binds.push(date_to); }

    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

    const { results } = await env.DB.prepare(
      `SELECT a.id, a.created_at, a.username, a.action, a.entity, a.entity_id, a.ip,
              COALESCE(itx.name, iitems.name, json_extract(a.payload_json,'$.after.name'), json_extract(a.payload_json,'$.name')) AS item_name,
              COALESCE(
                CASE WHEN a.entity = 'users' THEN
                  COALESCE(
                    json_extract(a.payload_json,'$.after.username'),
                    json_extract(a.payload_json,'$.before.username'),
                    json_extract(a.payload_json,'$.username'),
                    u.username
                  )
                END,
                NULL
              ) AS user_name
       FROM audit_log a
       LEFT JOIN stock_tx st
         ON a.entity = 'stock_tx' AND st.tx_no = a.entity_id
       LEFT JOIN items itx
         ON itx.id = st.item_id
       LEFT JOIN items iitems
         ON a.entity = 'items' AND iitems.id = CAST(a.entity_id AS INTEGER)
       LEFT JOIN users u
         ON a.entity = 'users' AND u.id = CAST(a.entity_id AS INTEGER)
       ${where}
       ORDER BY a.id DESC
       LIMIT ?`
    ).bind(...binds, limit).all<any>();

    const header = ["id","时间","用户","动作","实体","实体ID","IP","配件/对象","涉及用户"];
    const lines: string[] = [];
    lines.push(header.map(csvEscape).join(","));

    for (const r of (results || [])) {
      lines.push([
        r.id,
        r.created_at,
        r.username,
        r.action,
        r.entity,
        r.entity_id,
        r.ip,
        r.item_name,
        r.user_name
      ].map(csvEscape).join(","));
    }

    const csv = lines.join("\n");
    const ts = new Date().toISOString().replace(/[:.]/g,"-");
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="audit_log_${ts}.csv"`,
        "cache-control": "no-store",
      }
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
