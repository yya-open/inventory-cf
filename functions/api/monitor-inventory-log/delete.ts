import { requireAuth } from "../../_auth";
import { withErrorHandling } from '../_error';
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";
import { ensureMonitorSchemaIfAllowed } from "../_monitor";
import { syncAssetInventoryState } from '../services/asset-inventory-state';
import { deleteRowsByIdChunks, selectDistinctNumberColumnByIdChunks } from '../services/sql-batch';

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const actor = await requireAuth(env, request, "admin");
  if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

  const url = new URL(request.url);
  await ensureMonitorSchemaIfAllowed(env.DB, env, url);

  const body = await request.json().catch(() => ({} as any));
  requireConfirm(body, "删除", "二次确认不通过");

  const idsRaw = body?.ids ?? (body?.id !== undefined ? [body.id] : []);
  const ids = Array.isArray(idsRaw)
    ? idsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  if (!ids.length) return Response.json({ ok: false, message: "缺少 ids" }, { status: 400 });
  if (ids.length > 200) return Response.json({ ok: false, message: "一次最多删除 200 条" }, { status: 400 });

  const affectedAssetIds = await selectDistinctNumberColumnByIdChunks(env.DB, 'monitor_inventory_log', 'asset_id', ids);
  const deleted = await deleteRowsByIdChunks(env.DB, 'monitor_inventory_log', ids);
  await syncAssetInventoryState(env.DB, 'monitor', affectedAssetIds);

  await logAudit(env.DB, request, actor, "MONITOR_INVENTORY_LOG_DELETE", "monitor_inventory_log", null, { ids, deleted });
  return Response.json({ ok: true, data: { deleted } });
});
