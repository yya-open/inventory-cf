import { json } from "../_auth";
import { withErrorHandling } from './_error';
import { ensurePcReadFastGuards } from './_pc';
import { assertPcAssetDataScopeAccess, requireAuthWithDataScope } from "./services/data-scope";

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  const url = new URL(request.url);
  const assetId = Number(url.searchParams.get('id') || 0);
  if (!assetId) return Response.json({ ok: false, message: '缺少资产 ID' }, { status: 400 });
  await ensurePcReadFastGuards(env.DB);
  await assertPcAssetDataScopeAccess(env.DB, user, assetId, '电脑资产历史');
  const row = await env.DB.prepare(`
    WITH ordered_pc_out AS (
      SELECT
        a.status AS asset_status,
        o.employee_no,
        o.employee_name,
        o.department,
        COALESCE(NULLIF(o.config_date, ''), o.created_at) AS assigned_at,
        ROW_NUMBER() OVER (
          ORDER BY COALESCE(NULLIF(o.config_date, ''), o.created_at) DESC, o.created_at DESC, o.id DESC
        ) AS rn
      FROM pc_out o
      JOIN pc_assets a ON a.id = o.asset_id
      WHERE o.asset_id = ?
        AND (COALESCE(o.employee_no, '') <> '' OR COALESCE(o.employee_name, '') <> '' OR COALESCE(o.department, '') <> '')
    )
    SELECT
      employee_no AS previous_employee_no,
      employee_name AS previous_employee_name,
      department AS previous_department,
      assigned_at AS previous_assigned_at
    FROM ordered_pc_out
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
