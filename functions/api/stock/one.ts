import { requireAuth, errorResponse } from "../../_auth";

/**
 * GET /api/stock/one?item_id=1&warehouse_id=1
 * Return stock quantity for a single item in a warehouse.
 * (Used by StockOut.vue to show available qty.)
 */
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");

    const url = new URL(request.url);
    const item_id = Number(url.searchParams.get("item_id") || 0);
    const warehouse_id = Number(url.searchParams.get("warehouse_id") || 1);

    if (!item_id) {
      return Response.json({ ok: false, message: "缺少 item_id" }, { status: 400 });
    }

    const row = await env.DB.prepare(
      `
      SELECT
        i.id as item_id,
        i.warning_qty as warning_qty,
        COALESCE(s.qty, 0) as qty
      FROM items i
      LEFT JOIN stock s ON s.item_id = i.id AND s.warehouse_id = ?
      WHERE i.id = ? AND i.enabled = 1
      LIMIT 1
    `
    )
      .bind(warehouse_id, item_id)
      .first<any>();

    return Response.json({ ok: true, data: row || { item_id, warning_qty: 0, qty: 0 } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
