import { withErrorHandling } from './_error';
import { ensureMonitorReadFastGuards } from './_monitor';
import { ensurePcReadFastGuards } from './_pc';
import { getMonitorAssetLifecycle, getPcAssetLifecycle } from './services/asset-ownership';
import { requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库 DB' }, { status: 500 });
  const url = new URL(request.url);
  const kind = String(url.searchParams.get('kind') || '').trim().toLowerCase();
  const id = Number(url.searchParams.get('id') || 0);
  if (!id) return Response.json({ ok: false, message: '缺少资产 ID' }, { status: 400 });
  if (kind === 'monitor') {
    await ensureMonitorReadFastGuards(env.DB);
    const data = await getMonitorAssetLifecycle(env.DB, user, id);
    return Response.json({ ok: true, data });
  }
  await ensurePcReadFastGuards(env.DB);
  const data = await getPcAssetLifecycle(env.DB, user, id);
  return Response.json({ ok: true, data });
});
