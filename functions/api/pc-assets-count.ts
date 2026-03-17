import { requireAuth, errorResponse } from '../_auth';
import { ensurePcSchemaIfAllowed } from './_pc';
import { buildPcAssetQuery, countByWhere } from './services/asset-ledger';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    const timing = (env as any).__timing;
    if (timing?.measure) await timing.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const query = buildPcAssetQuery(url);
    const total = timing?.measure ? await timing.measure('count', () => countByWhere(env.DB, 'pc_assets a', query)) : await countByWhere(env.DB, 'pc_assets a', query);
    return Response.json({ ok: true, total });
  } catch (error: any) {
    return errorResponse(error);
  }
};
