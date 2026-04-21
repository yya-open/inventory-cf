import { errorResponse, json } from "../_auth";
import { assertMonitorAssetDataScopeAccess, requireAuthWithDataScope } from "./services/data-scope";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    const url = new URL(request.url);
    const assetId = Number(url.searchParams.get('id') || 0);
    if (!assetId) return Response.json({ ok: false, message: '缺少资产 ID' }, { status: 400 });
    const asset = await env.DB.prepare('SELECT id, department FROM monitor_assets WHERE id=?').bind(assetId).first<any>().catch(() => null);
    if (asset) assertMonitorAssetDataScopeAccess(user, asset.department, '显示器资产历史');
    const row = await env.DB.prepare(`
      SELECT
        t.employee_no AS previous_employee_no,
        t.employee_name AS previous_employee_name,
        t.department AS previous_department,
        t.created_at AS previous_assigned_at
      FROM monitor_tx t
      JOIN monitor_assets a ON a.id = t.asset_id
      WHERE t.asset_id = ?
        AND t.tx_type IN ('OUT', 'TRANSFER')
        AND (COALESCE(t.employee_no, '') <> '' OR COALESCE(t.employee_name, '') <> '' OR COALESCE(t.department, '') <> '')
        AND (
          a.status <> 'ASSIGNED'
          OR COALESCE(t.employee_no, '') <> COALESCE(a.employee_no, '')
          OR COALESCE(t.employee_name, '') <> COALESCE(a.employee_name, '')
          OR COALESCE(t.department, '') <> COALESCE(a.department, '')
        )
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 1
    `).bind(assetId).first<any>().catch(() => null);
    return json(true, row || { previous_employee_no: null, previous_employee_name: null, previous_department: null, previous_assigned_at: null });
  } catch (e: any) {
    return errorResponse(e);
  }
};
