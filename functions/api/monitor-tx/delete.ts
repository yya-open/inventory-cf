import { requireAuth } from "../../_auth";
import { withErrorHandling } from '../_error';
import { requireConfirm } from "../../_confirm";
import { ensureMonitorSchemaIfAllowed } from "../_monitor";
import { logAudit } from "../_audit";
import { recalcMonitorAssets } from "./_recalc";
import { syncSystemDictionaryUsageCounters } from '../services/system-dictionaries';
import { chunkValues, deleteRowsByIdChunks, selectDistinctNumberColumnByIdChunks } from '../services/sql-batch';

async function listLatestMonitorTxIds(db: D1Database, assetIds: number[]) {
  const ids = Array.from(new Set((assetIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return new Map<number, number>();
  const latest = new Map<number, number>();
  for (const chunkIds of chunkValues(ids)) {
    const placeholders = chunkIds.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT asset_id, id AS latest_id
         FROM (
           SELECT asset_id, id,
                  ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY created_at DESC, id DESC) AS rn
             FROM monitor_tx
            WHERE asset_id IN (${placeholders})
         ) ranked
        WHERE rn = 1`
    ).bind(...chunkIds).all<any>();
    for (const row of results || []) {
      const assetId = Number(row?.asset_id || 0);
      const latestId = Number(row?.latest_id || 0);
      if (assetId > 0 && latestId > 0) latest.set(assetId, latestId);
    }
  }
  return latest;
}

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const actor = await requireAuth(env, request, "admin");
  if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
  const url = new URL(request.url);
  await ensureMonitorSchemaIfAllowed(env.DB, env, url);

  const body = await request.json().catch(() => ({} as any));
  requireConfirm(body, "删除", "二次确认不通过");

  const ids: number[] = Array.isArray(body?.ids)
    ? body.ids.map((x: any) => Number(x)).filter((x: any) => Number.isFinite(x) && x > 0)
    : Array.isArray(body?.entries)
    ? body.entries.map((e: any) => Number(e?.id)).filter((x: any) => Number.isFinite(x) && x > 0)
    : [];
  if (!ids.length) return Response.json({ ok: false, message: "请选择要删除的记录" }, { status: 400 });

  const dedupAssetIds = await selectDistinctNumberColumnByIdChunks(env.DB, 'monitor_tx', 'asset_id', ids);
  const latestByAsset = await listLatestMonitorTxIds(env.DB, dedupAssetIds);
  const deletedIdSet = new Set(ids);
  const recalcAssetIds = dedupAssetIds.filter((assetId) => deletedIdSet.has(Number(latestByAsset.get(assetId) || 0)));

  const deleted = await deleteRowsByIdChunks(env.DB, 'monitor_tx', ids);

  if (recalcAssetIds.length) await recalcMonitorAssets(env.DB, recalcAssetIds);
  await syncSystemDictionaryUsageCounters(env.DB, []);
  await logAudit(env.DB, request, actor, "MONITOR_TX_DELETE", "monitor_tx", null, {
    ids,
    deleted,
    asset_ids: dedupAssetIds,
    recalculated_asset_ids: recalcAssetIds,
  });
  return Response.json({ ok: true, data: { deleted, recalculated: recalcAssetIds.length, skipped: Math.max(0, dedupAssetIds.length - recalcAssetIds.length) } });
});
