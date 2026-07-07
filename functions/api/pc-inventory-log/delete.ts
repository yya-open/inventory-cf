import { requireAuth } from "../../_auth";
import { withErrorHandling } from '../_error';
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";
import { ensurePcSchemaIfAllowed } from "../_pc";
import { syncAssetInventoryState } from '../services/asset-inventory-state';
import { deleteRowsByIdChunks, selectDistinctNumberColumnByIdChunks } from '../services/sql-batch';

// POST /api/pc-inventory-log/delete
// Admin-only. Deletes pc_inventory_log rows by id(s).
export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request, waitUntil }) => {
  const actor = await requireAuth(env, request, "admin");
  if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
  const url = new URL(request.url);
  const t = (env as any).__timing;
  if (t?.measure) await t.measure("schema", () => ensurePcSchemaIfAllowed(env.DB, env, url));
  else await ensurePcSchemaIfAllowed(env.DB, env, url);

  const body: any = await request.json().catch(() => ({}));
  const idsRaw = body?.ids ?? (body?.id !== undefined ? [body.id] : []);
  const ids = Array.isArray(idsRaw)
    ? idsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  requireConfirm(body, "删除", "二次确认不通过");

  if (!ids.length) return Response.json({ ok: false, message: "缺少 id" }, { status: 400 });
  if (ids.length > 200) return Response.json({ ok: false, message: "一次最多删除 200 条" }, { status: 400 });

  const affectedAssetIds = await selectDistinctNumberColumnByIdChunks(env.DB, 'pc_inventory_log', 'asset_id', ids);
  const deleted = await deleteRowsByIdChunks(env.DB, 'pc_inventory_log', ids);
  await syncAssetInventoryState(env.DB, 'pc', affectedAssetIds);

  waitUntil(
    logAudit(env.DB, request, actor, "PC_INVENTORY_LOG_DELETE", "pc_inventory_log", null, {
      ids,
      deleted,
    }).catch(() => {})
  );

  return Response.json({ ok: true, data: { deleted } });
});
