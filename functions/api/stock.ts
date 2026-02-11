import { requireAuth, errorResponse } from "../_auth";
import { buildKeywordWhere } from "./_search";
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  const user = await requireAuth(env, request, "viewer");
  const url = new URL(request.url);
  const keyword = (url.searchParams.get("keyword") || "").trim();
  const warehouse_id = 1; // 配件仓固定主仓

  const sort = (url.searchParams.get("sort") || "warning_first").trim();

  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
  const offset = (page - 1) * pageSize;

  const kw = buildKeywordWhere(keyword, {
    numericId: "i.id",
    exact: ["i.sku"],
    prefix: ["i.sku", "i.name"],
    contains: ["i.name", "i.brand", "i.model"],
  });
  const whereKw = kw.sql ? `AND ${kw.sql}` : ``;
  const binds = kw.binds;

  const totalRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM items i WHERE i.enabled=1 ${whereKw}`)
    .bind(...binds)
    .first<any>();

  const orderMap: Record<string, string> = {
    warning_first: "is_warning DESC, i.id DESC",
    qty_asc: "qty ASC, i.id DESC",
    qty_desc: "qty DESC, i.id DESC",
    sku_asc: "i.sku ASC, i.id DESC",
    name_asc: "i.name ASC, i.id DESC",
    id_asc: "i.id ASC",
    id_desc: "i.id DESC",
  };
  const orderBy = orderMap[sort] || orderMap.warning_first;

  const sql = `
    SELECT
      i.id as item_id, i.sku, i.name, i.brand, i.model, i.category, i.unit, i.warning_qty,
      COALESCE(s.qty, 0) as qty,
      CASE WHEN COALESCE(s.qty,0) <= i.warning_qty THEN 1 ELSE 0 END as is_warning
    FROM items i
    LEFT JOIN stock s ON s.item_id = i.id AND s.warehouse_id = ?
    WHERE i.enabled=1 ${whereKw}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const { results } = await env.DB.prepare(sql).bind(warehouse_id, ...binds, pageSize, offset).all();
  return Response.json({ ok: true, data: results, total: Number(totalRow?.c || 0), page, pageSize, keyword_mode: kw.mode, sort });

  } catch (e: any) {
    return errorResponse(e);
  }
};
