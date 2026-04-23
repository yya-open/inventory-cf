import { errorResponse } from "../_auth";
import { assertPcAssetIdsDataScopeAccess, requireAuthWithDataScope } from "./services/data-scope";
import { ensurePcQrColumns, ensurePcSchemaIfAllowed } from "./_pc";
import { getOrCreateAssetQrBulk } from "./services/asset-qr";

export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    const timing = (env as any).__timing;
    if (timing?.measure) await timing.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    await ensurePcQrColumns(env.DB);

    const body = await request.json<any>().catch(() => ({} as any));
    await assertPcAssetIdsDataScopeAccess(env.DB, user, Array.isArray(body?.ids) ? body.ids : [], '电脑二维码');
    const data = await getOrCreateAssetQrBulk(env.DB, {
      assetTable: 'pc_assets',
      notFoundMessage: '电脑台账不存在或已删除',
      publicPath: '/public/pc-asset',
    }, body?.ids, url.origin);

    return Response.json({ ok: true, data });
  } catch (error: any) {
    return errorResponse(error);
  }
};
