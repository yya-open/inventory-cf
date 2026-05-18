import { assertMonitorAssetIdsDataScopeAccess, requireAuthWithDataScope } from "./services/data-scope";
import { withErrorHandling } from "./_error";
import { ensureMonitorQrColumns, ensureMonitorSchemaIfAllowed } from "./_monitor";
import { getOrCreateAssetQrBulk } from "./services/asset-qr";

export const onRequestPost = withErrorHandling<{ DB: D1Database }>(async ({ env, request }) => {
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

  const url = new URL(request.url);
  await ensureMonitorSchemaIfAllowed(env.DB, env, url);
  await ensureMonitorQrColumns(env.DB);

  const body = await request.json().catch(() => ({} as any));
  await assertMonitorAssetIdsDataScopeAccess(env.DB, user, Array.isArray(body?.ids) ? body.ids : [], '显示器二维码');
  const data = await getOrCreateAssetQrBulk(env.DB, {
    assetTable: 'monitor_assets',
    notFoundMessage: '显示器台账不存在或已删除',
    publicPath: '/public/monitor-asset',
  }, body?.ids, url.origin);

  return Response.json({ ok: true, data });
});
