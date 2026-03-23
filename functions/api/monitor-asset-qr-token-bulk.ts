import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorQrColumns, ensureMonitorSchemaIfAllowed } from "./_monitor";
import { getOrCreateAssetQrBulk } from "./services/asset-qr";

export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);
    await ensureMonitorQrColumns(env.DB);

    const body = await request.json<any>().catch(() => ({} as any));
    const data = await getOrCreateAssetQrBulk(env.DB, {
      assetTable: 'monitor_assets',
      notFoundMessage: '显示器台账不存在或已删除',
      publicPath: '/public/monitor-asset',
    }, body?.ids, url.origin);

    return Response.json({ ok: true, data });
  } catch (error: any) {
    return errorResponse(error);
  }
};
