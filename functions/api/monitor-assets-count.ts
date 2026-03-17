import { requireAuth, errorResponse } from '../_auth';
import { ensureMonitorSchemaIfAllowed } from './_monitor';
import { buildMonitorAssetQuery, countByWhere } from './services/asset-ledger';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const query = buildMonitorAssetQuery(url);
    const total = await countByWhere(env.DB, 'monitor_assets a', query);
    return Response.json({ ok: true, total, data: { total } });
  } catch (error: any) {
    return errorResponse(error);
  }
};
