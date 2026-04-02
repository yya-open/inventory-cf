import { requireAuth, errorResponse, json } from "../_auth";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    const url = new URL(request.url);
    const assetId = Number(url.searchParams.get('id') || 0);
    if (!assetId) return Response.json({ ok: false, message: '缺少资产 ID' }, { status: 400 });
    const row = await env.DB.prepare(`
      SELECT
        o.employee_no AS previous_employee_no,
        o.employee_name AS previous_employee_name,
        o.department AS previous_department,
        COALESCE(NULLIF(o.config_date, ''), o.created_at) AS previous_assigned_at
      FROM pc_out o
      JOIN pc_assets a ON a.id = o.asset_id
      LEFT JOIN pc_asset_latest_state s ON s.asset_id = a.id
      WHERE o.asset_id = ?
        AND (COALESCE(o.employee_no, '') <> '' OR COALESCE(o.employee_name, '') <> '' OR COALESCE(o.department, '') <> '')
        AND (
          a.status <> 'ASSIGNED'
          OR COALESCE(o.employee_no, '') <> COALESCE(s.current_employee_no, '')
          OR COALESCE(o.employee_name, '') <> COALESCE(s.current_employee_name, '')
          OR COALESCE(o.department, '') <> COALESCE(s.current_department, '')
        )
      ORDER BY COALESCE(NULLIF(o.config_date, ''), o.created_at) DESC, o.created_at DESC, o.id DESC
      LIMIT 1
    `).bind(assetId).first<any>().catch(() => null);
    return json(true, row || { previous_employee_no: null, previous_employee_name: null, previous_department: null, previous_assigned_at: null });
  } catch (e: any) {
    return errorResponse(e);
  }
};
