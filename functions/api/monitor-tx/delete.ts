import { requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { ensureMonitorSchemaIfAllowed } from "../_monitor";
import { logAudit } from "../_audit";
import { recalcMonitorAssets } from "./_recalc";
import { syncSystemDictionaryUsageCounters } from '../services/system-dictionaries';

async function listLatestMonitorTxIds(db: D1Database, assetIds: number[]) {
  const ids = Array.from(new Set((assetIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return new Map<number, number>();
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT asset_id, id AS latest_id
       FROM (
         SELECT asset_id, id,
                ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY created_at DESC, id DESC) AS rn
           FROM monitor_tx
          WHERE asset_id IN (${placeholders})
       ) ranked
      WHERE rn = 1`
  ).bind(...ids).all<any>();
  const latest = new Map<number, number>();
  for (const row of results || []) {
    const assetId = Number(row?.asset_id || 0);
    const latestId = Number(row?.latest_id || 0);
    if (assetId > 0 && latestId > 0) latest.set(assetId, latestId);
  }
  return latest;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    requireConfirm(body, "删除", "二次确认不通过");

    const ids: number[] = Array.isArray(body?.ids)
      ? body.ids.map((x: any) => Number(x)).filter((x: any) => Number.isFinite(x) && x > 0)
      : Array.isArray(body?.entries)
      ? body.entries.map((e: any) => Number(e?.id)).filter((x: any) => Number.isFinite(x) && x > 0)
      : [];
    if (!ids.length) return Response.json({ ok: false, message: "请选择要删除的记录" }, { status: 400 });

    const q = `SELECT DISTINCT asset_id FROM monitor_tx WHERE id IN (${ids.map(() => "?").join(",")})`;
    const r = await env.DB.prepare(q).bind(...ids).all<any>();
    const assetIds = (r.results || []).map((x: any) => Number(x.asset_id)).filter((x: any) => x > 0);
    const dedupAssetIds = [...new Set(assetIds)];
    const latestByAsset = await listLatestMonitorTxIds(env.DB, dedupAssetIds);
    const deletedIdSet = new Set(ids);
    const recalcAssetIds = dedupAssetIds.filter((assetId) => deletedIdSet.has(Number(latestByAsset.get(assetId) || 0)));

    const del = await env.DB.prepare(`DELETE FROM monitor_tx WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).run();
    const deleted = Number((del as any)?.meta?.changes || 0);

    if (recalcAssetIds.length) await recalcMonitorAssets(env.DB, recalcAssetIds);
    await syncSystemDictionaryUsageCounters(env.DB, ['department']);
    await logAudit(env.DB, request, actor, "MONITOR_TX_DELETE", "monitor_tx", null, {
      ids,
      deleted,
      asset_ids: dedupAssetIds,
      recalculated_asset_ids: recalcAssetIds,
    });
    return Response.json({ ok: true, data: { deleted, recalculated: recalcAssetIds.length, skipped: Math.max(0, dedupAssetIds.length - recalcAssetIds.length) } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
