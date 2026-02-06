import { requireAuth, errorResponse } from "../_auth";
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  const user = await requireAuth(env, request, "viewer");
  const url = new URL(request.url);
  const warehouse_id = Number(url.searchParams.get("warehouse_id") || 1);

  const sql = `
    SELECT
      i.id as item_id, i.sku, i.name, i.brand, i.model, i.category, i.unit, i.warning_qty,
      COALESCE(s.qty,0) as qty
    FROM items i
    LEFT JOIN stock s ON s.item_id=i.id AND s.warehouse_id=?
    WHERE i.enabled=1 AND COALESCE(s.qty,0) <= i.warning_qty
    ORDER BY (i.warning_qty - COALESCE(s.qty,0)) DESC, i.id DESC
  `;
  const { results } = await env.DB.prepare(sql).bind(warehouse_id).all();
  return Response.json({ ok: true, data: results });

  } catch (e: any) {
    return errorResponse(e);
  }
};
