import { json } from "../_auth";
import { withErrorHandling } from './_error';
import { assertMonitorAssetDataScopeAccess, requireAuthWithDataScope } from "./services/data-scope";

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  const url = new URL(request.url);
  const assetId = Number(url.searchParams.get('id') || 0);
  if (!assetId) return Response.json({ ok: false, message: '缺少资产 ID' }, { status: 400 });
  const asset = await env.DB.prepare('SELECT id, department FROM monitor_assets WHERE id=?').bind(assetId).first<any>().catch(() => null);
  if (asset) assertMonitorAssetDataScopeAccess(user, asset.department, '显示器资产历史');
  const row = await env.DB.prepare(`
    WITH ordered_monitor_tx AS (
      SELECT
        a.status AS asset_status,
        t.employee_no,
        t.employee_name,
        t.department,
        t.created_at AS assigned_at,
        ROW_NUMBER() OVER (
          ORDER BY t.created_at DESC, t.id DESC
        ) AS rn
      FROM monitor_tx t
      JOIN monitor_assets a ON a.id = t.asset_id
      WHERE t.asset_id = ?
        AND t.tx_type IN ('OUT', 'TRANSFER')
        AND (COALESCE(t.employee_no, '') <> '' OR COALESCE(t.employee_name, '') <> '' OR COALESCE(t.department, '') <> '')
    )
    SELECT
      employee_no AS previous_employee_no,
      employee_name AS previous_employee_name,
      department AS previous_department,
      assigned_at AS previous_assigned_at
    FROM ordered_monitor_tx
    WHERE rn = (
      CASE
        WHEN asset_status = 'ASSIGNED' THEN 2
        ELSE 1
      END
    )
    LIMIT 1
  `).bind(assetId).first<any>().catch(() => null);
  return json(true, row || { previous_employee_no: null, previous_employee_name: null, previous_department: null, previous_assigned_at: null });
});
