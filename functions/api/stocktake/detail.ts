import { requireAuth, errorResponse } from "../_auth";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, \"viewer\");

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return Response.json({ ok:false, message:"缺少 id" }, { status:400 });

    const st = await env.DB.prepare(
      `SELECT s.*, w.name AS warehouse_name
       FROM stocktake s LEFT JOIN warehouses w ON w.id=s.warehouse_id
       WHERE s.id=?`
    ).bind(id).first();

    if (!st) return Response.json({ ok:false, message:"盘点单不存在" }, { status:404 });

    const { results } = await env.DB.prepare(
      `SELECT l.*, i.sku, i.name, i.category, i.brand, i.model, i.unit
       FROM stocktake_line l
       JOIN items i ON i.id = l.item_id
       WHERE l.stocktake_id=?
       ORDER BY i.sku ASC`
    ).bind(id).all();

    return Response.json({ ok:true, stocktake: st, lines: results });
  } catch (e:any) {
    return errorResponse(e);
  }
};
