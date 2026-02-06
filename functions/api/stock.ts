import { requireAuth, errorResponse } from "../_auth";
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  const user = await requireAuth(env, request, "viewer");
  const url = new URL(request.url);
  const keyword = (url.searchParams.get("keyword") || "").trim();
  const warehouse_id = Number(url.searchParams.get("warehouse_id") || 1);

  const whereKw = keyword ? `AND (i.name LIKE ? OR i.sku LIKE ? OR i.brand LIKE ? OR i.model LIKE ?)` : ``;
  const binds = keyword ? Array(4).fill(`%${keyword}%`) : [];

  const sql = `
    SELECT
      i.id as item_id, i.sku, i.name, i.brand, i.model, i.category, i.unit, i.warning_qty,
      COALESCE(s.qty, 0) as qty,
      CASE WHEN COALESCE(s.qty,0) <= i.warning_qty THEN 1 ELSE 0 END as is_warning
    FROM items i
    LEFT JOIN stock s ON s.item_id = i.id AND s.warehouse_id = ?
    WHERE i.enabled=1 ${whereKw}
    ORDER BY is_warning DESC, i.id DESC
  `;

  const { results } = await env.DB.prepare(sql).bind(warehouse_id, ...binds).all();
  return Response.json({ ok: true, data: results });
};
