export async function recalcPcAssetStatuses(db: D1Database, assetIds: (number|string)[]) {
  const ids = [...new Set(assetIds.map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0))];
  for (const assetId of ids) {
    const latest = await db.prepare(`
      SELECT evt_type, created_at, rid FROM (
        SELECT 'IN' as evt_type, created_at, id as rid FROM pc_in WHERE asset_id=?
        UNION ALL
        SELECT 'OUT' as evt_type, created_at, id as rid FROM pc_out WHERE asset_id=?
        UNION ALL
        SELECT action as evt_type, created_at, id as rid FROM pc_recycle WHERE asset_id=?
        UNION ALL
        SELECT 'SCRAP' as evt_type, created_at, id as rid FROM pc_scrap WHERE asset_id=?
      ) t
      ORDER BY created_at DESC, rid DESC
      LIMIT 1
    `).bind(assetId, assetId, assetId, assetId).first<any>();

    let status = 'IN_STOCK';
    const t = String(latest?.evt_type || '').toUpperCase();
    if (t === 'OUT') status = 'ASSIGNED';
    else if (t === 'RECYCLE') status = 'RECYCLED';
    else if (t === 'SCRAP') status = 'SCRAPPED';
    else if (t === 'RETURN' || t === 'IN') status = 'IN_STOCK';

    await db.prepare(`UPDATE pc_assets SET status=?, updated_at=datetime('now','+8 hours') WHERE id=?`).bind(status, assetId).run();
  }
}
