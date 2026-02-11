import { requireAuth, errorResponse } from "../_auth";
import { toSqlRange } from "./_date";
import { buildKeywordWhere } from "./_search";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    const url = new URL(request.url);

    const type = (url.searchParams.get("type") || "").trim();
    const item_id = url.searchParams.get("item_id");
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const date_from = url.searchParams.get("date_from");
    const date_to = url.searchParams.get("date_to");

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
    const offset = (page - 1) * pageSize;

    const wh: string[] = [];
    const binds: any[] = [];

    // Force parts warehouse (仓库1)
    wh.push(`t.warehouse_id=?`);
    binds.push(1);

    if (type) {
      wh.push(`t.type=?`);
      binds.push(type);
    }
    if (item_id) {
      wh.push(`t.item_id=?`);
      binds.push(Number(item_id));
    }

    // Keyword strategy: exact -> prefix -> limited contains
    // Matches: tx id/tx_no/ref_no/remark, item sku/name, warehouse name
    if (keyword) {
      const kw = buildKeywordWhere(keyword, {
        numericId: "t.id",
        exact: ["t.tx_no", "t.ref_no", "i.sku"],
        prefix: ["t.tx_no", "t.ref_no", "i.sku", "i.name", "w.name"],
        contains: ["i.name", "t.remark", "t.ref_no"],
      });
      if (kw.sql) {
        wh.push(kw.sql);
        binds.push(...kw.binds);
      }
    }

    const fromSql = toSqlRange(date_from, false);
    const toSql = toSqlRange(date_to, true);
    if (fromSql) {
      wh.push(`t.created_at >= ?`);
      binds.push(fromSql);
    }
    if (toSql) {
      wh.push(`t.created_at <= ?`);
      binds.push(toSql);
    }

    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";

    // Sorting (whitelist)
    const sortByRaw = (url.searchParams.get("sort_by") || "id").trim();
    const sortDirRaw = (url.searchParams.get("sort_dir") || "desc").trim().toLowerCase();
    const sortDir = sortDirRaw === "asc" ? "ASC" : "DESC";
    const sortMap: Record<string, string> = {
      id: "t.id",
      created_at: "t.created_at",
      tx_no: "t.tx_no",
      type: "t.type",
      sku: "i.sku",
      name: "i.name",
      warehouse: "w.name",
      qty: "t.qty",
    };
    const sortCol = sortMap[sortByRaw] || "t.id";
    const orderBy = `${sortCol} ${sortDir}, t.id DESC`;

    const totalRow = await env.DB.prepare(
      `SELECT COUNT(*) as c
       FROM stock_tx t
       JOIN items i ON i.id=t.item_id
       JOIN warehouses w ON w.id=t.warehouse_id
       ${where}`
    )
      .bind(...binds)
      .first<any>();

    const sql = `
      SELECT t.*, i.sku, i.name, i.unit, w.name as warehouse_name
      FROM stock_tx t
      JOIN items i ON i.id=t.item_id
      JOIN warehouses w ON w.id=t.warehouse_id
      ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const { results } = await env.DB.prepare(sql).bind(...binds, pageSize, offset).all();

    return Response.json({
      ok: true,
      data: results,
      total: Number(totalRow?.c || 0),
      page,
      pageSize,
      sort_by: sortByRaw,
      sort_dir: sortDirRaw,
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
