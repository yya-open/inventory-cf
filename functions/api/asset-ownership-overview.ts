import { withErrorHandling } from './_error';
import { ensureMonitorReadFastGuards } from './_monitor';
import { ensurePcReadFastGuards } from './_pc';
import { getAssetOwnershipOverview } from './services/asset-ownership';
import { requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库 DB' }, { status: 500 });
  await Promise.all([
    ensurePcReadFastGuards(env.DB),
    ensureMonitorReadFastGuards(env.DB),
  ]);
  const data = await getAssetOwnershipOverview(env.DB, user, new URL(request.url));
  return Response.json({ ok: true, data });
});
