import { requireAuth, errorResponse } from "../_auth";
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  const user = await requireAuth(env, request, "viewer");
  const url = new URL(request.url);
  const keyword = (url.searchParams.get("keyword") || "").trim();
  const warehouse_id = Number(url.searchParams.get("warehouse_id") || 1);

  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
  const offset = (page - 1) * pageSize;

  const whereKw = keyword ? `AND (i.name LIKE ? OR i.sku LIKE ? OR i.brand LIKE ? OR i.model LIKE ?)` : ``;
  const binds = keyword ? Array(4).fill(`%${keyword}%`) : [];

  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM items i WHERE i.enabled=1 ${whereKw}`
  ).bind(...binds).first<any>();

  const sql = `
    SELECT
      i.id as item_id, i.sku, i.name, i.brand, i.model, i.category, i.unit, i.warning_qty,
      COALESCE(s.qty, 0) as qty,
      CASE WHEN COALESCE(s.qty,0) <= i.warning_qty THEN 1 ELSE 0 END as is_warning
    FROM items i
    LEFT JOIN stock s ON s.item_id = i.id AND s.warehouse_id = ?
    WHERE i.enabled=1 ${whereKw}
    ORDER BY is_warning DESC, i.id DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await env.DB.prepare(sql).bind(warehouse_id, ...binds, pageSize, offset).all();
  return Response.json({ ok: true, data: results, total: Number(totalRow?.c || 0), page, pageSize });

  } catch (e: any) {
    return errorResponse(e);
  }
};
