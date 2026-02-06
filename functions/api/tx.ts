import { requireAuth, errorResponse } from "../_auth";
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  const user = await requireAuth(env, request, "viewer");
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";
  const item_id = url.searchParams.get("item_id");
  const date_from = url.searchParams.get("date_from");
  const date_to = url.searchParams.get("date_to");

  const wh: string[] = [];
  const binds: any[] = [];

  if (type) { wh.push(`t.type=?`); binds.push(type); }
  if (item_id) { wh.push(`t.item_id=?`); binds.push(Number(item_id)); }
  if (date_from) { wh.push(`t.created_at >= ?`); binds.push(date_from); }
  if (date_to) { wh.push(`t.created_at <= ?`); binds.push(date_to); }

  const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

  const sql = `
    SELECT t.*, i.sku, i.name, i.unit, w.name as warehouse_name
    FROM stock_tx t
    JOIN items i ON i.id=t.item_id
    JOIN warehouses w ON w.id=t.warehouse_id
    ${where}
    ORDER BY t.id DESC
    LIMIT 500
  `;

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return Response.json({ ok: true, data: results });
};
