import { requireAuth, errorResponse } from "../_auth";
import { buildKeywordWhere } from "../_search";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");

    const url = new URL(request.url);
    const warehouse_id = url.searchParams.get("warehouse_id");
    const status = (url.searchParams.get("status") || "").trim();
    const keyword = (url.searchParams.get("keyword") || "").trim();

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
    const offset = (page - 1) * pageSize;

    const wh: string[] = ["1=1"];
    const binds: any[] = [];

    if (warehouse_id) {
      wh.push("s.warehouse_id=?");
      binds.push(Number(warehouse_id));
    }
    if (status) {
      wh.push("s.status=?");
      binds.push(String(status));
    }

    if (keyword) {
      const kw = buildKeywordWhere(keyword, {
        numericId: "s.id",
        exact: ["s.st_no"],
        prefix: ["s.st_no", "s.status"],
        contains: ["s.st_no", "s.status"],
      });
      if (kw.sql) {
        wh.push(kw.sql);
        binds.push(...kw.binds);
      }
    }

    const where = `WHERE ${wh.join(" AND ")}`;

    const totalRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM stocktake s ${where}`)
      .bind(...binds)
      .first<any>();

    const sortByRaw = (url.searchParams.get("sort_by") || "id").trim();
    const sortDirRaw = (url.searchParams.get("sort_dir") || "asc").trim().toLowerCase();
    const sortDir = sortDirRaw === "desc" ? "DESC" : "ASC";
    const sortMap: Record<string, string> = {
      id: "s.id",
      st_no: "s.st_no",
      created_at: "s.created_at",
      status: "s.status",
    };
    const sortCol = sortMap[sortByRaw] || "s.id";
    const orderBy = `${sortCol} ${sortDir}, s.id ASC`;

    const { results } = await env.DB.prepare(
      `SELECT s.*, w.name AS warehouse_name
       FROM stocktake s
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
      .bind(...binds, pageSize, offset)
      .all();

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
