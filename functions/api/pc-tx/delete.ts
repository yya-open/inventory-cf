import { requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";
import { ensurePcSchemaIfAllowed } from "../_pc";
import { recalcPcAssetStatuses } from "./_recalc";
import { syncSystemDictionaryUsageCounters } from '../services/system-dictionaries';

type Entry = { id: number; type: string };

type PcLatestEvent = {
  asset_id: number;
  evt_type: string;
  rid: number;
  last_in_id: number | null;
  last_out_id: number | null;
  last_recycle_id: number | null;
};

function normTable(t: string) {
  const x = String(t || '').toUpperCase();
  if (x === 'IN') return 'pc_in';
  if (x === 'OUT') return 'pc_out';
  if (x === 'RETURN' || x === 'RECYCLE') return 'pc_recycle';
  if (x === 'SCRAP') return 'pc_scrap';
  return '';
}

function toDeleteLookup(groups: Record<string, number[]>) {
  return {
    pc_in: new Set(groups.pc_in || []),
    pc_out: new Set(groups.pc_out || []),
    pc_recycle: new Set(groups.pc_recycle || []),
    pc_scrap: new Set(groups.pc_scrap || []),
  };
}

function pcAssetNeedsRecalc(row: PcLatestEvent | undefined, deleted: ReturnType<typeof toDeleteLookup>) {
  if (!row) return false;
  const evt = String(row.evt_type || '').toUpperCase();
  if (evt === 'IN' && deleted.pc_in.has(Number(row.rid || 0))) return true;
  if (evt === 'OUT' && deleted.pc_out.has(Number(row.rid || 0))) return true;
  if ((evt === 'RETURN' || evt === 'RECYCLE') && deleted.pc_recycle.has(Number(row.rid || 0))) return true;
  if (evt === 'SCRAP' && deleted.pc_scrap.has(Number(row.rid || 0))) return true;
  if (row.last_in_id && deleted.pc_in.has(Number(row.last_in_id))) return true;
  if (row.last_out_id && deleted.pc_out.has(Number(row.last_out_id))) return true;
  if (row.last_recycle_id && deleted.pc_recycle.has(Number(row.last_recycle_id))) return true;
  return false;
}

async function listPcLatestEvents(db: D1Database, assetIds: number[]) {
  const ids = Array.from(new Set((assetIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return new Map<number, PcLatestEvent>();
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db.prepare(
    `WITH latest_evt AS (
       SELECT asset_id, evt_type, rid
       FROM (
         SELECT asset_id, evt_type, rid,
                ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY created_at DESC, rid DESC) AS rn
         FROM (
           SELECT asset_id, 'IN' AS evt_type, id AS rid, created_at FROM pc_in WHERE asset_id IN (${placeholders})
           UNION ALL
           SELECT asset_id, 'OUT' AS evt_type, id AS rid, created_at FROM pc_out WHERE asset_id IN (${placeholders})
           UNION ALL
           SELECT asset_id, UPPER(action) AS evt_type, id AS rid, created_at FROM pc_recycle WHERE asset_id IN (${placeholders})
           UNION ALL
           SELECT asset_id, 'SCRAP' AS evt_type, id AS rid, created_at FROM pc_scrap WHERE asset_id IN (${placeholders})
         ) all_evt
       ) ranked
       WHERE rn = 1
     ), latest_in AS (
       SELECT asset_id, id AS last_in_id
       FROM (
         SELECT asset_id, id,
                ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY created_at DESC, id DESC) AS rn
         FROM pc_in
         WHERE asset_id IN (${placeholders})
       ) ranked
       WHERE rn = 1
     ), latest_out AS (
       SELECT asset_id, id AS last_out_id
       FROM (
         SELECT asset_id, id,
                ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY created_at DESC, id DESC) AS rn
         FROM pc_out
         WHERE asset_id IN (${placeholders})
       ) ranked
       WHERE rn = 1
     ), latest_recycle AS (
       SELECT asset_id, id AS last_recycle_id
       FROM (
         SELECT asset_id, id,
                ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY created_at DESC, id DESC) AS rn
         FROM pc_recycle
         WHERE asset_id IN (${placeholders})
       ) ranked
       WHERE rn = 1
     )
     SELECT a.id AS asset_id,
            le.evt_type,
            le.rid,
            li.last_in_id,
            lo.last_out_id,
            lr.last_recycle_id
     FROM pc_assets a
     LEFT JOIN latest_evt le ON le.asset_id = a.id
     LEFT JOIN latest_in li ON li.asset_id = a.id
     LEFT JOIN latest_out lo ON lo.asset_id = a.id
     LEFT JOIN latest_recycle lr ON lr.asset_id = a.id
     WHERE a.id IN (${placeholders})`
  ).bind(...ids, ...ids, ...ids, ...ids, ...ids, ...ids, ...ids, ...ids).all<PcLatestEvent>();

  const latestByAsset = new Map<number, PcLatestEvent>();
  for (const row of results || []) {
    const assetId = Number(row?.asset_id || 0);
    if (assetId > 0) latestByAsset.set(assetId, row as PcLatestEvent);
  }
  return latestByAsset;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });
    await ensurePcSchemaIfAllowed(env.DB, env, new URL(request.url));

    const body = await request.json().catch(() => ({} as any));
    requireConfirm(body, "删除", "二次确认不通过");

    const entries: Entry[] = Array.isArray(body?.entries)
      ? body.entries.map((e:any) => ({ id: Number(e?.id), type: String(e?.type || '').toUpperCase() }))
          .filter((e:Entry) => Number.isFinite(e.id) && e.id > 0 && !!normTable(e.type))
      : [];
    if (!entries.length) return Response.json({ ok:false, message:"请选择要删除的记录" }, { status:400 });

    const groups: Record<string, number[]> = { pc_in: [], pc_out: [], pc_recycle: [], pc_scrap: [] };
    for (const e of entries) groups[normTable(e.type)].push(e.id);

    const assetIds: number[] = [];
    for (const [table, ids] of Object.entries(groups)) {
      if (!ids.length) continue;
      const q = `SELECT asset_id FROM ${table} WHERE id IN (${ids.map(()=>'?').join(',')})`;
      const r = await env.DB.prepare(q).bind(...ids).all<any>();
      for (const row of (r.results || [])) if (row?.asset_id) assetIds.push(Number(row.asset_id));
    }
    const dedupAssetIds = [...new Set(assetIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
    const latestByAsset = await listPcLatestEvents(env.DB, dedupAssetIds);
    const deleteLookup = toDeleteLookup(groups);
    const recalcAssetIds = dedupAssetIds.filter((assetId) => pcAssetNeedsRecalc(latestByAsset.get(assetId), deleteLookup));

    let deleted = 0;
    for (const [table, ids] of Object.entries(groups)) {
      if (!ids.length) continue;
      const q = `DELETE FROM ${table} WHERE id IN (${ids.map(()=>'?').join(',')})`;
      const r:any = await env.DB.prepare(q).bind(...ids).run();
      deleted += Number(r?.meta?.changes || 0);
    }

    if (recalcAssetIds.length) await recalcPcAssetStatuses(env.DB, recalcAssetIds);
    await syncSystemDictionaryUsageCounters(env.DB, []);
    await logAudit(env.DB, request, actor, "PC_TX_DELETE", "pc_tx", null, {
      count: entries.length,
      deleted,
      entries,
      asset_ids: dedupAssetIds,
      recalculated_asset_ids: recalcAssetIds,
    });
    return Response.json({ ok:true, data:{ deleted, recalculated: recalcAssetIds.length, skipped: Math.max(0, dedupAssetIds.length - recalcAssetIds.length) } });
  } catch (e:any) {
    return errorResponse(e);
  }
};
