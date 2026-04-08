import { sqlNowStored } from '../_time';

export async function ensureMonitorLatestStateTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS monitor_asset_latest_state (
      asset_id INTEGER PRIMARY KEY,
      last_tx_id INTEGER,
      last_tx_type TEXT,
      last_tx_at TEXT,
      current_location_id INTEGER,
      current_employee_no TEXT,
      current_employee_name TEXT,
      current_department TEXT,
      updated_at TEXT NOT NULL DEFAULT ${sqlNowStored()}
    )`
  ).run();
  for (const ddl of [
    `ALTER TABLE monitor_asset_latest_state ADD COLUMN current_tx_type TEXT`,
    `ALTER TABLE monitor_asset_latest_state ADD COLUMN current_tx_id INTEGER`,
    `ALTER TABLE monitor_asset_latest_state ADD COLUMN current_tx_at TEXT`,
  ]) {
    await db.prepare(ddl).run().catch(() => {});
  }
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_monitor_asset_latest_state_current_department ON monitor_asset_latest_state(current_department, asset_id)`).run().catch(() => {});
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_monitor_asset_latest_state_current_tx ON monitor_asset_latest_state(current_tx_type, current_tx_id, asset_id)`).run().catch(() => {});
}

export async function upsertMonitorLatestState(
  db: D1Database,
  assetId: number,
  patch: {
    last_tx_id?: number | null;
    last_tx_type?: string | null;
    last_tx_at?: string | null;
    current_location_id?: number | null;
    current_employee_no?: string | null;
    current_employee_name?: string | null;
    current_department?: string | null;
    current_tx_type?: string | null;
    current_tx_id?: number | null;
    current_tx_at?: string | null;
  },
) {
  await ensureMonitorLatestStateTable(db);
  await db.prepare(
    `INSERT INTO monitor_asset_latest_state (
      asset_id, last_tx_id, last_tx_type, last_tx_at,
      current_location_id, current_employee_no, current_employee_name, current_department,
      current_tx_type, current_tx_id, current_tx_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${sqlNowStored()})
    ON CONFLICT(asset_id) DO UPDATE SET
      last_tx_id=COALESCE(excluded.last_tx_id, monitor_asset_latest_state.last_tx_id),
      last_tx_type=COALESCE(excluded.last_tx_type, monitor_asset_latest_state.last_tx_type),
      last_tx_at=COALESCE(excluded.last_tx_at, monitor_asset_latest_state.last_tx_at),
      current_location_id=COALESCE(excluded.current_location_id, monitor_asset_latest_state.current_location_id),
      current_employee_no=excluded.current_employee_no,
      current_employee_name=excluded.current_employee_name,
      current_department=excluded.current_department,
      current_tx_type=COALESCE(excluded.current_tx_type, monitor_asset_latest_state.current_tx_type),
      current_tx_id=COALESCE(excluded.current_tx_id, monitor_asset_latest_state.current_tx_id),
      current_tx_at=COALESCE(excluded.current_tx_at, monitor_asset_latest_state.current_tx_at),
      updated_at=${sqlNowStored()}`
  ).bind(
    assetId,
    patch.last_tx_id ?? null,
    patch.last_tx_type ?? null,
    patch.last_tx_at ?? null,
    patch.current_location_id ?? null,
    patch.current_employee_no ?? null,
    patch.current_employee_name ?? null,
    patch.current_department ?? null,
    patch.current_tx_type ?? null,
    patch.current_tx_id ?? null,
    patch.current_tx_at ?? null,
  ).run();
}

export async function rebuildMonitorLatestStateForAssets(db: D1Database, assetIds: number[]) {
  await ensureMonitorLatestStateTable(db);
  const ids = [...new Set(assetIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))];
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const rows = (await db.prepare(
    `SELECT ranked.*
     FROM (
       SELECT t.*,
              ROW_NUMBER() OVER (PARTITION BY t.asset_id ORDER BY t.created_at DESC, t.id DESC) AS rn
       FROM monitor_tx t
       WHERE t.asset_id IN (${placeholders})
     ) ranked
     WHERE ranked.rn = 1`
  ).bind(...ids).all<any>()).results || [];
  const byAsset = new Map<number, any>();
  for (const row of rows) byAsset.set(Number(row.asset_id || 0), row);

  const stmts: D1PreparedStatement[] = [];
  for (const assetId of ids) {
    const row = byAsset.get(assetId);
    if (!row) {
      stmts.push(db.prepare(`DELETE FROM monitor_asset_latest_state WHERE asset_id=?`).bind(assetId));
      continue;
    }
    const type = String(row.tx_type || '');
    const clearsEmployee = type === 'IN' || type === 'RETURN' || type === 'SCRAP';
    stmts.push(
      db.prepare(
        `INSERT INTO monitor_asset_latest_state (
          asset_id, last_tx_id, last_tx_type, last_tx_at,
          current_location_id, current_employee_no, current_employee_name, current_department,
          current_tx_type, current_tx_id, current_tx_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${sqlNowStored()})
        ON CONFLICT(asset_id) DO UPDATE SET
          last_tx_id=excluded.last_tx_id,
          last_tx_type=excluded.last_tx_type,
          last_tx_at=excluded.last_tx_at,
          current_location_id=excluded.current_location_id,
          current_employee_no=excluded.current_employee_no,
          current_employee_name=excluded.current_employee_name,
          current_department=excluded.current_department,
          current_tx_type=excluded.current_tx_type,
          current_tx_id=excluded.current_tx_id,
          current_tx_at=excluded.current_tx_at,
          updated_at=${sqlNowStored()}`
      ).bind(
        assetId,
        Number(row.id || 0) || null,
        type || null,
        row.created_at || null,
        row.to_location_id ?? row.from_location_id ?? null,
        clearsEmployee ? null : (row.employee_no || null),
        clearsEmployee ? null : (row.employee_name || null),
        clearsEmployee ? null : (row.department || null),
        type || null,
        Number(row.id || 0) || null,
        row.created_at || null,
      )
    );
  }

  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
}
