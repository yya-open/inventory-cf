import { requireAuth, errorResponse, json } from "../_auth";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return json(false, null, "未绑定 D1 数据库(DB)");

    const url = new URL(request.url);
    const warehouse_id = Number(url.searchParams.get("warehouse_id") || 1);
    const category = (url.searchParams.get("category") || "").trim();
    const keyword = (url.searchParams.get("keyword") || "").trim();

    const whereParts: string[] = ["i.enabled=1", "COALESCE(s.qty,0) <= i.warning_qty"];
    const binds: any[] = [warehouse_id];

    if (category) {
      whereParts.push("i.category = ?");
      binds.push(category);
    }

    if (keyword) {
      whereParts.push("(i.name LIKE ? OR i.sku LIKE ? OR i.brand LIKE ? OR i.model LIKE ?)");
      const like = `%${keyword}%`;
      binds.push(like, like, like, like);
    }

    const sql = `
      SELECT
        i.id as item_id, i.sku, i.name, i.brand, i.model, i.category, i.unit, i.warning_qty,
        COALESCE(s.qty,0) as qty
      FROM items i
      LEFT JOIN stock s ON s.item_id=i.id AND s.warehouse_id=?
      WHERE ${whereParts.join(" AND ")}
      ORDER BY (i.warning_qty - COALESCE(s.qty,0)) DESC, i.id DESC
    `;
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return Response.json({ ok: true, data: results });
  } catch (e: any) {
    return errorResponse(e);
  }
};
