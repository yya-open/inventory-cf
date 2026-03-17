import { requireAuth, errorResponse } from "../_auth";
import { ensureMonitorQrColumns, ensureMonitorSchemaIfAllowed } from "./_monitor";
import { initMissingAssetQrKeys } from "./services/asset-qr";

export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensureMonitorSchemaIfAllowed(env.DB, env, url));
    else await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    await ensureMonitorQrColumns(env.DB);
    const body = await request.json<any>().catch(() => ({} as any));
    const batchSize = Math.min(200, Math.max(10, Number(body?.batch_size || 50)));
    const result = await initMissingAssetQrKeys(env.DB, {
      assetTable: "monitor_assets",
      notFoundMessage: "显示器台账不存在或已删除",
      publicPath: "/public/monitor-asset",
    }, batchSize);

    return Response.json({ ok: true, updated: result.updated, message: result.updated ? `已补齐 ${result.updated} 条` : "无需补齐" });
  } catch (e: any) {
    return errorResponse(e);
  }
};
