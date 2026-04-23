import { errorResponse } from '../_auth';
import { ensurePcReadFastGuards } from './_pc';
import { buildPcAssetQuery } from './services/asset-ledger';
import { countAssetPage, ensureSchemaTimed } from './services/asset-http';
import { requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    await ensureSchemaTimed(env as any, 'schema', () => ensurePcReadFastGuards(env.DB));
    const query = buildPcAssetQuery(url, user);
    const total = await countAssetPage(env.DB, env as any, 'pc_assets a', query);
    return Response.json({ ok: true, total });
  } catch (error: any) {
    return errorResponse(error);
  }
};
