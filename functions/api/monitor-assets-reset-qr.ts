import { withErrorHandling } from './_error';
import { requirePermission } from "../_permissions";
import { assertMonitorAssetDataScopeAccess, getUserDataScope } from "./services/data-scope";
import { ensureMonitorQrColumns, ensureMonitorSchemaIfAllowed } from "./_monitor";
import { resetAssetQr } from "./services/asset-qr";

export const onRequestPost = withErrorHandling<{ DB: D1Database }>(async ({ env, request }) => {
  const actor = await requirePermission(env, request, 'qr_reset', 'viewer');
  const user = Object.assign(actor, await getUserDataScope(env.DB, actor.id));
  if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

  const url = new URL(request.url);
  const t = (env as any).__timing;
  if (t?.measure) await t.measure("schema", () => ensureMonitorSchemaIfAllowed(env.DB, env, url));
  else await ensureMonitorSchemaIfAllowed(env.DB, env, url);

  await ensureMonitorQrColumns(env.DB);
  const id = Number(url.searchParams.get("id") || 0);
  const asset = await env.DB.prepare('SELECT id, department FROM monitor_assets WHERE id=?').bind(id).first<any>();
  if (asset) assertMonitorAssetDataScopeAccess(user, asset.department, '显示器二维码');
  const result = await resetAssetQr(env.DB, {
    assetTable: "monitor_assets",
    notFoundMessage: "显示器台账不存在或已删除",
    publicPath: "/public/monitor-asset",
  }, id, url.origin);

  return Response.json({ ok: true, ...result });
});
