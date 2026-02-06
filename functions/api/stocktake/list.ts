import { requireAuth, errorResponse } from "../_auth";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, \"viewer\");

    const url = new URL(request.url);
    const warehouse_id = url.searchParams.get("warehouse_id");
    const status = url.searchParams.get("status");

    const binds: any[] = [];
    let where = "WHERE 1=1";
    if (warehouse_id) { where += " AND s.warehouse_id=?"; binds.push(Number(warehouse_id)); }
    if (status) { where += " AND s.status=?"; binds.push(String(status)); }

    const { results } = await env.DB.prepare(
      `SELECT s.*, w.name AS warehouse_name
       FROM stocktake s
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       ${where}
       ORDER BY s.id DESC
       LIMIT 200`
    ).bind(...binds).all();

    return Response.json({ ok: true, data: results });
  } catch (e:any) {
    return errorResponse(e);
  }
};
