import { withErrorHandling } from './_error';
import { requirePermission } from "../_permissions";
import { assertPcAssetDataScopeAccess, getUserDataScope } from "./services/data-scope";
import { ensurePcSchemaIfAllowed } from "./_pc";
import { resetAssetQr } from "./services/asset-qr";

export const onRequestPost = withErrorHandling<{ DB: D1Database }>(async ({ env, request }) => {
  const actor = await requirePermission(env, request, 'qr_reset', 'viewer');
  const user = Object.assign(actor, await getUserDataScope(env.DB, actor.id));
  if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

  const url = new URL(request.url);
  const t = (env as any).__timing;
  if (t?.measure) await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));
  else await ensurePcSchemaIfAllowed(env.DB, env, url);

  const id = Number(url.searchParams.get("id") || 0);
  await assertPcAssetDataScopeAccess(env.DB, user, id, '电脑二维码');
  const result = await resetAssetQr(env.DB, {
    assetTable: "pc_assets",
    notFoundMessage: "电脑台账不存在或已删除",
    publicPath: "/public/pc-asset",
  }, id, url.origin);

  return Response.json({ ok: true, ...result });
});
