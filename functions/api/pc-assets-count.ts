import { withErrorHandling } from './_error';
import { buildPcAssetQuery } from './services/asset-ledger';
import { countAssetPage } from './services/asset-http';
import { requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

  const url = new URL(request.url);
  const query = buildPcAssetQuery(url, user);
  if (query.fast) {
    return Response.json({ ok: true, total: null });
  }
  const total = await countAssetPage(env.DB, env as any, 'pc_assets a', query);
  return Response.json({ ok: true, total });
});
