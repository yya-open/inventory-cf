import { recalcPcAssetStatuses } from '../pc-tx/_recalc';
import { recalcMonitorAssets } from '../monitor-tx/_recalc';

export async function finalizeRestoreState(db: D1Database) {
  const pcIdsRes = await db.prepare('SELECT id FROM pc_assets').all<any>();
  const pcIds = (pcIdsRes.results || []).map((r: any) => Number(r.id)).filter((v: number) => Number.isFinite(v) && v > 0);
  if (pcIds.length) {
    const chunk = 100;
    for (let i = 0; i < pcIds.length; i += chunk) {
      await recalcPcAssetStatuses(db, pcIds.slice(i, i + chunk));
    }
  }

  const monIdsRes = await db.prepare('SELECT id FROM monitor_assets').all<any>();
  const monIds = (monIdsRes.results || []).map((r: any) => Number(r.id)).filter((v: number) => Number.isFinite(v) && v > 0);
  if (monIds.length) {
    const chunk = 100;
    for (let i = 0; i < monIds.length; i += chunk) {
      await recalcMonitorAssets(db, monIds.slice(i, i + chunk));
    }
  }
}
