import { sqlNowStored } from "../_time";
import { buildMonitorAssetSearchText } from '../services/asset-ledger';
import { rebuildMonitorLatestStateForAssets } from '../services/monitor-latest-state';

export async function recalcMonitorAssets(db: D1Database, assetIds: number[]) {
  const ids = [...new Set(assetIds.filter((x) => Number.isFinite(x) && x > 0))];
  if (!ids.length) return;

  const q = `
    SELECT s.asset_id, t.*
    FROM monitor_asset_latest_state s
    LEFT JOIN monitor_tx t ON t.id = s.current_tx_id
    WHERE s.asset_id IN (${ids.map(() => "?").join(",")})
  `;
  const r = await db.prepare(q).bind(...ids).all<any>();
  const latest = new Map<number, any>();
  for (const row of (r.results || []) as any[]) latest.set(Number(row.asset_id), row);

  await rebuildMonitorLatestStateForAssets(db, ids);
  const refreshed = await db.prepare(q).bind(...ids).all<any>();
  latest.clear();
  for (const row of (refreshed.results || []) as any[]) latest.set(Number(row.asset_id), row);

  const batch: D1PreparedStatement[] = [];
  for (const id of ids) {
    const t = latest.get(id);
    if (!t) {
      batch.push(
        db
          .prepare(
            `UPDATE monitor_assets
             SET status='IN_STOCK', employee_no=NULL, department=NULL, employee_name=NULL, is_employed=NULL, search_text_norm=?,
                 updated_at=${sqlNowStored()}
             WHERE id=?`
          )
          .bind(buildMonitorAssetSearchText({}, {}), id)
      );
      continue;
    }

    const type = String(t.tx_type || "");
    if (type === "OUT") {
      batch.push(
        db
          .prepare(
            `UPDATE monitor_assets
             SET status='ASSIGNED', location_id=?, employee_no=?, department=?, employee_name=?, is_employed=?, search_text_norm=?, updated_at=${sqlNowStored()}
             WHERE id=?`
          )
          .bind(t.to_location_id || null, t.employee_no || null, t.department || null, t.employee_name || null, t.is_employed || null, buildMonitorAssetSearchText(t, { employee_no: t.employee_no || null, employee_name: t.employee_name || null, department: t.department || null }), id)
      );
    } else if (type === "IN" || type === "RETURN") {
      batch.push(
        db
          .prepare(
            `UPDATE monitor_assets
             SET status='IN_STOCK', location_id=?, employee_no=NULL, department=NULL, employee_name=NULL, is_employed=NULL, search_text_norm=?,
                 updated_at=${sqlNowStored()}
             WHERE id=?`
          )
          .bind(t.to_location_id || null, buildMonitorAssetSearchText(t, {}), id)
      );
    } else if (type === "TRANSFER") {
      batch.push(db.prepare(`UPDATE monitor_assets SET location_id=?, search_text_norm=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(t.to_location_id || null, buildMonitorAssetSearchText(t, { employee_no: t.employee_no || null, employee_name: t.employee_name || null, department: t.department || null }), id));
    } else if (type === "SCRAP") {
      batch.push(
        db
          .prepare(
            `UPDATE monitor_assets
             SET status='SCRAPPED', employee_no=NULL, department=NULL, employee_name=NULL, is_employed=NULL, search_text_norm=?,
                 updated_at=${sqlNowStored()}
             WHERE id=?`
          )
          .bind(buildMonitorAssetSearchText(t, {}), id)
      );
    } else {
      batch.push(db.prepare(`UPDATE monitor_assets SET updated_at=${sqlNowStored()} WHERE id=?`).bind(id));
    }
  }

  const chunk = 50;
  for (let i = 0; i < batch.length; i += chunk) {
    await db.batch(batch.slice(i, i + chunk));
  }
}
