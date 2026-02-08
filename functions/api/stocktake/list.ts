import { requireAuth, errorResponse } from "../_auth";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "viewer");

    const url = new URL(request.url);
    const warehouse_id = url.searchParams.get("warehouse_id");
    const status = url.searchParams.get("status");

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
    const offset = (page - 1) * pageSize;
    const withTotal = (url.searchParams.get("with_total") ?? "1") === "1";

    const binds: any[] = [];
    let where = "WHERE 1=1";
    if (warehouse_id) { where += " AND s.warehouse_id=?"; binds.push(Number(warehouse_id)); }
    if (status) { where += " AND s.status=?"; binds.push(String(status)); }

    const totalRow = await env.DB.prepare(
      `SELECT COUNT(*) as c FROM stocktake s ${where}`
    ).bind(...binds).first<any>() : null;

    const { results } = await env.DB.prepare(
      `SELECT s.*, w.name AS warehouse_name
       FROM stocktake s
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       ${where}
       ORDER BY s.id ASC
       LIMIT ? OFFSET ?`
    ).bind(...binds, pageSize, offset).all();

    return Response.json({ ok: true, data: results, total: withTotal ? Number((totalRow as any)?.c || 0) : null, page, pageSize });
  } catch (e:any) {
    return errorResponse(e);
  }
};
