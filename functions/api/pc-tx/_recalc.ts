import { sqlNowStored } from "../_time";
import { rebuildPcLatestStateForAssets } from '../services/pc-latest-state';

export async function recalcPcAssetStatuses(db: D1Database, assetIds: (number | string)[]) {
  const ids = [...new Set(assetIds.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0))];
  if (!ids.length) return;

  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db.prepare(`
    SELECT ranked.*
    FROM (
      SELECT t.*,
             ROW_NUMBER() OVER (PARTITION BY t.asset_id ORDER BY t.created_at DESC, t.rid DESC) AS rn
      FROM (
        SELECT asset_id, 'IN' as evt_type, created_at, id as rid FROM pc_in WHERE asset_id IN (${placeholders})
        UNION ALL
        SELECT asset_id, 'OUT' as evt_type, created_at, id as rid FROM pc_out WHERE asset_id IN (${placeholders})
        UNION ALL
        SELECT asset_id, action as evt_type, created_at, id as rid FROM pc_recycle WHERE asset_id IN (${placeholders})
        UNION ALL
        SELECT asset_id, 'SCRAP' as evt_type, created_at, id as rid FROM pc_scrap WHERE asset_id IN (${placeholders})
      ) t
    ) ranked
    WHERE ranked.rn = 1
  `).bind(...ids, ...ids, ...ids, ...ids).all<any>();

  const latest = new Map<number, any>();
  for (const row of (results || []) as any[]) latest.set(Number(row.asset_id), row);

  const batch: D1PreparedStatement[] = [];
  for (const id of ids) {
    const row = latest.get(id);
    let status = "IN_STOCK";
    if (row) {
      const t = String(row.evt_type || "").toUpperCase();
      if (t === "OUT") status = "ASSIGNED";
      else if (t === "RECYCLE") status = "RECYCLED";
      else if (t === "SCRAP") status = "SCRAPPED";
      else if (t === "RETURN" || t === "IN") status = "IN_STOCK";
    }
    batch.push(db.prepare(`UPDATE pc_assets SET status=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(status, id));
  }

  const chunk = 50;
  for (let i = 0; i < batch.length; i += chunk) {
    await db.batch(batch.slice(i, i + chunk));
  }

  await rebuildPcLatestStateForAssets(db, ids);
}
