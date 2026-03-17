import { requireAuth, errorResponse } from "../_auth";
import { ensurePcSchemaIfAllowed } from "./_pc";
import { initMissingAssetQrKeys } from "./services/asset-qr";

export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const batch = Math.max(1, Math.min(500, Number(url.searchParams.get("batch") || 200)));
    const result = await initMissingAssetQrKeys(env.DB, {
      assetTable: "pc_assets",
      notFoundMessage: "电脑台账不存在或已删除",
      publicPath: "/public/pc-asset",
    }, batch);

    return Response.json({ ok: true, updated: result.updated });
  } catch (e: any) {
    return errorResponse(e);
  }
};
