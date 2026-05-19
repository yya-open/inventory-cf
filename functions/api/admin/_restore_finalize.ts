import { recalcPcAssetStatuses } from '../pc-tx/_recalc';
import { recalcMonitorAssets } from '../monitor-tx/_recalc';

export async function finalizeRestoreState(db: D1Database) {
  const chunk = 100;
  let pcLastId = 0;
  while (true) {
    const pcIdsRes = await db.prepare('SELECT id FROM pc_assets WHERE id>? ORDER BY id ASC LIMIT ?').bind(pcLastId, chunk).all<any>();
    const pcIds = (pcIdsRes.results || []).map((r: any) => Number(r.id)).filter((v: number) => Number.isFinite(v) && v > 0);
    if (!pcIds.length) break;
    await recalcPcAssetStatuses(db, pcIds);
    pcLastId = pcIds[pcIds.length - 1];
    if (pcIds.length < chunk) break;
  }

  let monitorLastId = 0;
  while (true) {
    const monIdsRes = await db.prepare('SELECT id FROM monitor_assets WHERE id>? ORDER BY id ASC LIMIT ?').bind(monitorLastId, chunk).all<any>();
    const monIds = (monIdsRes.results || []).map((r: any) => Number(r.id)).filter((v: number) => Number.isFinite(v) && v > 0);
    if (!monIds.length) break;
    await recalcMonitorAssets(db, monIds);
    monitorLastId = monIds[monIds.length - 1];
    if (monIds.length < chunk) break;
  }
}
