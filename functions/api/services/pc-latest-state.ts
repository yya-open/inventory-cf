import { sqlNowStored } from '../_time';

export async function ensurePcLatestStateTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS pc_asset_latest_state (
      asset_id INTEGER PRIMARY KEY,
      last_out_id INTEGER,
      last_in_id INTEGER,
      last_recycle_id INTEGER,
      current_employee_no TEXT,
      current_employee_name TEXT,
      current_department TEXT,
      last_config_date TEXT,
      last_out_at TEXT,
      last_in_at TEXT,
      last_recycle_date TEXT,
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      FOREIGN KEY(asset_id) REFERENCES pc_assets(id) ON DELETE CASCADE,
      FOREIGN KEY(last_out_id) REFERENCES pc_out(id) ON DELETE SET NULL,
      FOREIGN KEY(last_in_id) REFERENCES pc_in(id) ON DELETE SET NULL,
      FOREIGN KEY(last_recycle_id) REFERENCES pc_recycle(id) ON DELETE SET NULL
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_pc_asset_latest_state_current_department ON pc_asset_latest_state(current_department, asset_id)`).run();
}

export async function upsertPcLatestState(db: D1Database, assetId: number, patch: {
  last_out_id?: number | null;
  last_in_id?: number | null;
  last_recycle_id?: number | null;
  current_employee_no?: string | null;
  current_employee_name?: string | null;
  current_department?: string | null;
  last_config_date?: string | null;
  last_out_at?: string | null;
  last_in_at?: string | null;
  last_recycle_date?: string | null;
}) {
  await ensurePcLatestStateTable(db);
  await db.prepare(
    `INSERT INTO pc_asset_latest_state (
      asset_id, last_out_id, last_in_id, last_recycle_id,
      current_employee_no, current_employee_name, current_department,
      last_config_date, last_out_at, last_in_at, last_recycle_date, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${sqlNowStored()})
    ON CONFLICT(asset_id) DO UPDATE SET
      last_out_id=COALESCE(excluded.last_out_id, pc_asset_latest_state.last_out_id),
      last_in_id=COALESCE(excluded.last_in_id, pc_asset_latest_state.last_in_id),
      last_recycle_id=COALESCE(excluded.last_recycle_id, pc_asset_latest_state.last_recycle_id),
      current_employee_no=excluded.current_employee_no,
      current_employee_name=excluded.current_employee_name,
      current_department=excluded.current_department,
      last_config_date=COALESCE(excluded.last_config_date, pc_asset_latest_state.last_config_date),
      last_out_at=COALESCE(excluded.last_out_at, pc_asset_latest_state.last_out_at),
      last_in_at=COALESCE(excluded.last_in_at, pc_asset_latest_state.last_in_at),
      last_recycle_date=COALESCE(excluded.last_recycle_date, pc_asset_latest_state.last_recycle_date),
      updated_at=${sqlNowStored()}`
  ).bind(
    assetId,
    patch.last_out_id ?? null,
    patch.last_in_id ?? null,
    patch.last_recycle_id ?? null,
    patch.current_employee_no ?? null,
    patch.current_employee_name ?? null,
    patch.current_department ?? null,
    patch.last_config_date ?? null,
    patch.last_out_at ?? null,
    patch.last_in_at ?? null,
    patch.last_recycle_date ?? null,
  ).run();
}

export async function rebuildPcLatestStateForAssets(db: D1Database, assetIds: Array<number | string>) {
  await ensurePcLatestStateTable(db);
  const ids = Array.from(new Set((assetIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT
       a.id AS asset_id,
       a.status,
       lo.id AS last_out_id,
       lo.employee_no AS current_employee_no,
       lo.employee_name AS current_employee_name,
       lo.department AS current_department,
       lo.config_date AS last_config_date,
       lo.created_at AS last_out_at,
       li.id AS last_in_id,
       li.created_at AS last_in_at,
       lr.id AS last_recycle_id,
       lr.recycle_date AS last_recycle_date
     FROM pc_assets a
     LEFT JOIN pc_out lo ON lo.id = (
       SELECT id FROM pc_out WHERE asset_id = a.id ORDER BY id DESC LIMIT 1
     )
     LEFT JOIN pc_in li ON li.id = (
       SELECT id FROM pc_in WHERE asset_id = a.id ORDER BY id DESC LIMIT 1
     )
     LEFT JOIN pc_recycle lr ON lr.id = (
       SELECT id FROM pc_recycle WHERE asset_id = a.id ORDER BY id DESC LIMIT 1
     )
     WHERE a.id IN (${placeholders})`
  ).bind(...ids).all<any>();
  const statements: D1PreparedStatement[] = [];
  const seen = new Set<number>();
  for (const row of results || []) {
    const assetId = Number(row?.asset_id || 0);
    if (!assetId) continue;
    seen.add(assetId);
    const assigned = String(row?.status || '') === 'ASSIGNED';
    statements.push(db.prepare(
      `INSERT INTO pc_asset_latest_state (
        asset_id, last_out_id, last_in_id, last_recycle_id,
        current_employee_no, current_employee_name, current_department,
        last_config_date, last_out_at, last_in_at, last_recycle_date, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${sqlNowStored()})
      ON CONFLICT(asset_id) DO UPDATE SET
        last_out_id=excluded.last_out_id,
        last_in_id=excluded.last_in_id,
        last_recycle_id=excluded.last_recycle_id,
        current_employee_no=excluded.current_employee_no,
        current_employee_name=excluded.current_employee_name,
        current_department=excluded.current_department,
        last_config_date=excluded.last_config_date,
        last_out_at=excluded.last_out_at,
        last_in_at=excluded.last_in_at,
        last_recycle_date=excluded.last_recycle_date,
        updated_at=${sqlNowStored()}`
    ).bind(
      assetId,
      row?.last_out_id ?? null,
      row?.last_in_id ?? null,
      row?.last_recycle_id ?? null,
      assigned ? row?.current_employee_no ?? null : null,
      assigned ? row?.current_employee_name ?? null : null,
      assigned ? row?.current_department ?? null : null,
      row?.last_config_date ?? null,
      row?.last_out_at ?? null,
      row?.last_in_at ?? null,
      row?.last_recycle_date ?? null,
    ));
  }
  for (const assetId of ids) {
    if (!seen.has(assetId)) {
      statements.push(db.prepare(`DELETE FROM pc_asset_latest_state WHERE asset_id=?`).bind(assetId));
    }
  }
  if (statements.length) await db.batch(statements);
}
