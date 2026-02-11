import { requireAuth, errorResponse, json } from "../_auth";
import { buildKeywordWhere } from "./_search";

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

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
    const offset = (page - 1) * pageSize;

    const whereParts: string[] = ["i.enabled=1"];
    // Note: we need warehouse_id twice (stock join + last_tx subquery)
    const binds: any[] = [warehouse_id];

    if (only_alert) {
      whereParts.push("COALESCE(s.qty,0) <= COALESCE(i.warning_qty,0)");
    }

    if (category) {
      whereParts.push("i.category = ?");
      binds.push(category);
    }

    if (keyword) {
      const kw = buildKeywordWhere(keyword, {
        numericId: "i.id",
        exact: ["i.sku"],
        prefix: ["i.sku", "i.name"],
        contains: ["i.name", "i.brand", "i.model"],
      });
      if (kw.sql) {
        whereParts.push(kw.sql);
        binds.push(...kw.binds);
      }
    }

    const orderBy = getSort(sort);

    const baseSql = `
      SELECT
        i.id as item_id,
        i.sku, i.name, i.brand, i.model, i.category, i.unit,
        COALESCE(i.warning_qty,0) as warning_qty,
        COALESCE(s.qty,0) as qty,
        (COALESCE(i.warning_qty,0) - COALESCE(s.qty,0)) as gap,
        (
          SELECT MAX(tx.created_at)
          FROM stock_tx tx
          WHERE tx.warehouse_id = ? AND tx.item_id = i.id
        ) as last_tx_at
      FROM items i
      LEFT JOIN stock s ON s.item_id=i.id AND s.warehouse_id=?
      WHERE ${whereParts.join(" AND ")}
    `;

    const countSql = `SELECT COUNT(*) as c FROM ( ${baseSql} ) x`;

    // bind order: last_tx warehouse_id, stock join warehouse_id, then filters
    const bindAll = [warehouse_id, ...binds];
    const totalRow = await env.DB.prepare(countSql).bind(...bindAll).first<any>();

    const sql = `${baseSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    const { results } = await env.DB.prepare(sql).bind(...bindAll, pageSize, offset).all();
    return Response.json({ ok: true, data: results, total: Number(totalRow?.c || 0), page, pageSize });
  } catch (e: any) {
    return errorResponse(e);
  }
};
