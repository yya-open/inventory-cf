import { errorResponse } from '../../_auth';
import { ensurePcSchemaIfAllowed } from '../_pc';
import { applyDepartmentDataScopeClause, requireAuthWithDataScope, scopeAllowsAssetWarehouse } from '../services/data-scope';

const ISSUE_CODES = ['NOT_FOUND', 'WRONG_LOCATION', 'WRONG_QR', 'WRONG_STATUS', 'MISSING', 'OTHER'] as const;

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const byIssueType: Record<string, number> = Object.fromEntries(ISSUE_CODES.map((code) => [code, 0]));
    if (!scopeAllowsAssetWarehouse(user, '电脑仓')) {
      return Response.json({ ok: true, data: { byIssueType } });
    }

    const wh = ["l.action='ISSUE'"];
    const binds: any[] = [];
    applyDepartmentDataScopeClause(wh, binds, 's.current_department', user);
    const sql = `
      SELECT l.issue_type, COUNT(*) AS c
      FROM pc_inventory_log l
      JOIN pc_assets a ON a.id = l.asset_id
      LEFT JOIN pc_asset_latest_state s ON s.asset_id = a.id
      WHERE ${wh.join(' AND ')}
      GROUP BY l.issue_type
    `;

    const rows = t?.measure
      ? await t.measure('query', async () => env.DB.prepare(sql).bind(...binds).all<any>())
      : await env.DB.prepare(sql).bind(...binds).all<any>();

    for (const row of rows?.results || []) {
      const key = String((row as any)?.issue_type || '').trim().toUpperCase();
      if (key) byIssueType[key] = Number((row as any)?.c || 0);
    }

    return Response.json({ ok: true, data: { byIssueType } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
