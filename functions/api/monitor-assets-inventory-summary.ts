import { errorResponse } from '../_auth';
import { ensureMonitorSchemaIfAllowed } from './_monitor';
import { buildMonitorAssetQuery } from './services/asset-ledger';
import { queryInventorySummaryByWhere } from './services/asset-inventory-state';
import { requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const params = new URL(url);
    params.searchParams.delete('inventory_status');
    const query = buildMonitorAssetQuery(params, user);
    const data = await queryInventorySummaryByWhere(env.DB, 'monitor_assets a', query);
    return Response.json({ ok: true, data });
  } catch (error: any) {
    return errorResponse(error);
  }
};
