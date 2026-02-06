import { requireAuth, errorResponse, json } from "../_auth";

function getSort(sqlKey: string) {
  // Allowed sort keys to prevent SQL injection
  switch (sqlKey) {
    case "gap_asc":
      return "gap ASC, qty ASC, i.id DESC";
    case "qty_asc":
      return "qty ASC, gap DESC, i.id DESC";
    case "sku_asc":
      return "i.sku ASC, i.id DESC";
    case "name_asc":
      return "i.name ASC, i.id DESC";
    case "gap_desc":
    default:
      return "gap DESC, qty ASC, i.id DESC";
  }
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return json(false, null, "未绑定 D1 数据库(DB)");

    const url = new URL(request.url);
    const warehouse_id = Number(url.searchParams.get("warehouse_id") || 1);
    const category = (url.searchParams.get("category") || "").trim();
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const only_alert = (url.searchParams.get("only_alert") ?? "1") !== "0";
    const sort = (url.searchParams.get("sort") || "gap_desc").trim();

    const whereParts: string[] = ["i.enabled=1"];
    const binds: any[] = [warehouse_id];

    if (only_alert) {
      whereParts.push("COALESCE(s.qty,0) <= COALESCE(i.warning_qty,0)");
    }

    if (category) {
      whereParts.push("i.category = ?");
      binds.push(category);
    }

    if (keyword) {
      whereParts.push("(i.name LIKE ? OR i.sku LIKE ? OR i.brand LIKE ? OR i.model LIKE ?)");
      const like = `%${keyword}%`;
      binds.push(like, like, like, like);
    }

    const orderBy = getSort(sort);

    const sql = `
      SELECT
        i.id as item_id,
        i.sku, i.name, i.brand, i.model, i.category, i.unit,
        COALESCE(i.warning_qty,0) as warning_qty,
        COALESCE(s.qty,0) as qty,
        (COALESCE(i.warning_qty,0) - COALESCE(s.qty,0)) as gap
      FROM items i
      LEFT JOIN stock s ON s.item_id=i.id AND s.warehouse_id=?
      WHERE ${whereParts.join(" AND ")}
      ORDER BY ${orderBy}
    `;
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return Response.json({ ok: true, data: results });
  } catch (e: any) {
    return errorResponse(e);
  }
};
