import { requireAuth, errorResponse } from "../../_auth";
import { toSqlRange } from "../_date";
import { buildKeywordWhere } from "../_search";

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
      const kw = buildKeywordWhere(keyword, {
        numericId: "a.id",
        exact: ["a.entity_id"],
        prefix: ["a.username", "a.action", "a.entity", "a.entity_id"],
        contains: ["a.username", "a.action", "a.entity", "a.entity_id"],
      });
      if (kw.sql) {
        wh.push(kw.sql);
        binds.push(...kw.binds);
      }
    }
    if (action) { wh.push("a.action=?"); binds.push(action); }
    if (entity) { wh.push("a.entity=?"); binds.push(entity); }
    if (user) { wh.push("a.username=?"); binds.push(user); }
    const fromSql = toSqlRange(date_from, false);
    const toSql = toSqlRange(date_to, true);
    if (fromSql) { wh.push("a.created_at >= ?"); binds.push(fromSql); }
    if (toSql) { wh.push("a.created_at <= ?"); binds.push(toSql); }

    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

    const totalRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM audit_log a ${where}`)
      .bind(...binds)
      .first<any>();

    const sortByRaw = (url.searchParams.get("sort_by") || "id").trim();
    const sortDirRaw = (url.searchParams.get("sort_dir") || "desc").trim().toLowerCase();
    const sortDir = sortDirRaw === "asc" ? "ASC" : "DESC";
    const sortMap: Record<string, string> = { id: "a.id", created_at: "a.created_at" };
    const sortCol = sortMap[sortByRaw] || "a.id";
    const orderBy = `${sortCol} ${sortDir}`;

    // Enrich entity display for stock_tx: show item name by joining via tx_no.
    // (audit_log.entity_id stores tx_no when entity='stock_tx')
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.created_at, a.username, a.action, a.entity, a.entity_id, a.ip, a.ua, a.payload_json,
              -- For stock_tx/items, show item name
              COALESCE(itx.name, iitems.name, json_extract(a.payload_json,'$.after.name'), json_extract(a.payload_json,'$.name')) AS item_name,
              -- For users, show the username at the time of the operation (works even after deletion)
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
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    ).bind(...binds, pageSize, offset).all();

    return Response.json({ ok: true, data: results, total: Number(totalRow?.c || 0), page, pageSize });
  } catch (e: any) {
    return errorResponse(e);
  }
};
