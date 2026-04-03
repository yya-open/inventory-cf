import { errorResponse } from "../_auth";
import { requirePermission } from "../_permissions";
import { ensureMonitorQrColumns, ensureMonitorSchemaIfAllowed } from "./_monitor";
import { resetAssetQr } from "./services/asset-qr";

export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ env, request }) => {
  try {
    await requirePermission(env, request, 'qr_reset', 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensureMonitorSchemaIfAllowed(env.DB, env, url));
    else await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    await ensureMonitorQrColumns(env.DB);
    const id = Number(url.searchParams.get("id") || 0);
    const result = await resetAssetQr(env.DB, {
      assetTable: "monitor_assets",
      notFoundMessage: "显示器台账不存在或已删除",
      publicPath: "/public/monitor-asset",
    }, id, url.origin);

    return Response.json({ ok: true, ...result });
  } catch (e: any) {
    return errorResponse(e);
  }
};
