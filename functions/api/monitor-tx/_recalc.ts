import { sqlNowStored } from "../_time";

export async function recalcMonitorAssets(db: D1Database, assetIds: number[]) {
  const ids = [...new Set(assetIds.filter((x) => Number.isFinite(x) && x > 0))];
  if (!ids.length) return;

  const q = `
    SELECT t.*
    FROM monitor_tx t
    JOIN (
      SELECT asset_id, MAX(id) AS max_id
      FROM monitor_tx
      WHERE asset_id IN (${ids.map(() => "?").join(",")})
      GROUP BY asset_id
    ) x ON x.max_id = t.id
  `;
  const r = await db.prepare(q).bind(...ids).all<any>();
  const latest = new Map<number, any>();
  for (const row of (r.results || []) as any[]) latest.set(Number(row.asset_id), row);

  const batch: D1PreparedStatement[] = [];
  for (const id of ids) {
    const t = latest.get(id);
    if (!t) {
      batch.push(
        db
          .prepare(
            `UPDATE monitor_assets
             SET status='IN_STOCK', employee_no=NULL, department=NULL, employee_name=NULL, is_employed=NULL,
                 updated_at=${sqlNowStored()}
             WHERE id=?`
          )
          .bind(id)
      );
      continue;
    }

    const type = String(t.tx_type || "");
    if (type === "OUT") {
      batch.push(
        db
          .prepare(
            `UPDATE monitor_assets
             SET status='ASSIGNED', location_id=?, employee_no=?, department=?, employee_name=?, is_employed=?, updated_at=${sqlNowStored()}
             WHERE id=?`
          )
          .bind(t.to_location_id || null, t.employee_no || null, t.department || null, t.employee_name || null, t.is_employed || null, id)
      );
    } else if (type === "IN" || type === "RETURN") {
      batch.push(
        db
          .prepare(
            `UPDATE monitor_assets
             SET status='IN_STOCK', location_id=?, employee_no=NULL, department=NULL, employee_name=NULL, is_employed=NULL,
                 updated_at=${sqlNowStored()}
             WHERE id=?`
          )
          .bind(t.to_location_id || null, id)
      );
    } else if (type === "TRANSFER") {
      batch.push(db.prepare(`UPDATE monitor_assets SET location_id=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(t.to_location_id || null, id));
    } else if (type === "SCRAP") {
      batch.push(
        db
          .prepare(
            `UPDATE monitor_assets
             SET status='SCRAPPED', employee_no=NULL, department=NULL, employee_name=NULL, is_employed=NULL,
                 updated_at=${sqlNowStored()}
             WHERE id=?`
          )
          .bind(id)
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
