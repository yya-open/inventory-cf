import { requireAuth, errorResponse } from "../_auth";
import { toSqlRange } from "./_date";
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  const user = await requireAuth(env, request, "viewer");
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";
  const item_id = url.searchParams.get("item_id");
  const date_from = url.searchParams.get("date_from");
  const date_to = url.searchParams.get("date_to");

  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
  const offset = (page - 1) * pageSize;

  const wh: string[] = [];
  const binds: any[] = [];

  if (type) { wh.push(`t.type=?`); binds.push(type); }
  if (item_id) { wh.push(`t.item_id=?`); binds.push(Number(item_id)); }
  const fromSql = toSqlRange(date_from, false);
  const toSql = toSqlRange(date_to, true);
  if (fromSql) { wh.push(`t.created_at >= ?`); binds.push(fromSql); }
  if (toSql) { wh.push(`t.created_at <= ?`); binds.push(toSql); }

  const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

  const sql = `
    SELECT t.*, i.sku, i.name, i.unit, w.name as warehouse_name
    FROM stock_tx t
    JOIN items i ON i.id=t.item_id
    JOIN warehouses w ON w.id=t.warehouse_id
    ${where}
    ORDER BY t.id DESC
    LIMIT ? OFFSET ?
  `;

  const totalRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM stock_tx t ${where}`).bind(...binds).first<any>();

  const { results } = await env.DB.prepare(sql).bind(...binds, pageSize, offset).all();
  return Response.json({ ok: true, data: results, total: Number(totalRow?.c || 0), page, pageSize });

  } catch (e: any) {
    return errorResponse(e);
  }
};
