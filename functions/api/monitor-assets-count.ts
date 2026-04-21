import { errorResponse } from '../_auth';
import { ensureMonitorSchemaIfAllowed } from './_monitor';
import { buildMonitorAssetQuery } from './services/asset-ledger';
import { countAssetPage, ensureSchemaTimed } from './services/asset-http';
import { requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    const url = new URL(request.url);
    await ensureSchemaTimed(env as any, 'schema', () => ensureMonitorSchemaIfAllowed(env.DB, env, url));
    const query = buildMonitorAssetQuery(url, user);
    const total = await countAssetPage(env.DB, env as any, 'monitor_assets a', query);
    return Response.json({ ok: true, total, data: { total } });
  } catch (error: any) {
    return errorResponse(error);
  }
};
