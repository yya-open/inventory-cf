import { sqlNowStored, sqlBjDate } from '../_time';
import { scopeAllowsAssetWarehouse, type UserDataScope } from './data-scope';

export type DashboardMode = 'pc' | 'parts';
export type DailySnapshotRow = { day: string; metrics: Record<string, number> };

function listDays(from: string, to: string) {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    const dt = new Date(`${cur}T00:00:00+08:00`);
    dt.setUTCDate(dt.getUTCDate() + 1);
    cur = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }
  return out;
}

function scopeKey(scope?: UserDataScope | null) {
  return JSON.stringify({
    data_scope_type: scope?.data_scope_type || 'all',
    data_scope_value: scope?.data_scope_value || null,
    data_scope_value2: scope?.data_scope_value2 || null,
  });
}

function parseMetrics(value: any) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function ensureReportSnapshotTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS report_daily_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date TEXT NOT NULL,
      mode TEXT NOT NULL,
      warehouse_id INTEGER NOT NULL DEFAULT 0,
      scope_key TEXT NOT NULL,
      metrics_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      UNIQUE(snapshot_date, mode, warehouse_id, scope_key)
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_report_daily_snapshots_lookup ON report_daily_snapshots(mode, warehouse_id, snapshot_date, scope_key)`).run();
}

async function computePcDay(db: D1Database, day: string, scope?: UserDataScope | null) {
  if (!scopeAllowsAssetWarehouse(scope, '电脑仓')) {
    return { in_qty: 0, out_qty: 0, return_qty: 0, recycle_qty: 0, scrap_qty: 0, tx_count: 0 };
  }
  const dept = scope?.data_scope_type === 'department' || scope?.data_scope_type === 'department_warehouse' ? String(scope?.data_scope_value || '').trim() : '';
  const join = dept ? `JOIN pc_asset_latest_state s ON s.asset_id=t.asset_id` : '';
  const where = dept ? ` AND TRIM(COALESCE(s.current_department,''))=?` : '';
  const binds = dept ? [dept] : [];
  const sum = await db.prepare(
    `SELECT
      (SELECT COUNT(*) FROM pc_in t ${join} WHERE ${sqlBjDate('t.created_at')}=date(?) ${where}) AS in_qty,
      (SELECT COUNT(*) FROM pc_out t ${join} WHERE ${sqlBjDate('t.created_at')}=date(?) ${where}) AS out_qty,
      (SELECT COUNT(*) FROM pc_recycle t ${join} WHERE UPPER(COALESCE(action,''))='RETURN' AND ${sqlBjDate('t.created_at')}=date(?) ${where}) AS return_qty,
      (SELECT COUNT(*) FROM pc_recycle t ${join} WHERE UPPER(COALESCE(action,''))='RECYCLE' AND ${sqlBjDate('t.created_at')}=date(?) ${where}) AS recycle_qty,
      (SELECT COUNT(*) FROM pc_scrap t ${join} WHERE ${sqlBjDate('t.created_at')}=date(?) ${where}) AS scrap_qty`
  ).bind(day, ...binds, day, ...binds, day, ...binds, day, ...binds, day, ...binds).first<any>();
  const inQty = Number(sum?.in_qty || 0);
  const outQty = Number(sum?.out_qty || 0);
  const returnQty = Number(sum?.return_qty || 0);
  const recycleQty = Number(sum?.recycle_qty || 0);
  const scrapQty = Number(sum?.scrap_qty || 0);
  return {
    in_qty: inQty,
    out_qty: outQty,
    return_qty: returnQty,
    recycle_qty: recycleQty,
    scrap_qty: scrapQty,
    tx_count: inQty + outQty + returnQty + recycleQty + scrapQty,
  };
}

async function computePartsDay(db: D1Database, day: string, warehouseId: number, scope?: UserDataScope | null) {
  if (!scopeAllowsAssetWarehouse(scope, '配件仓')) {
    return { in_qty: 0, out_qty: 0, adjust_qty: 0, tx_count: 0 };
  }
  const sum = await db.prepare(
    `SELECT
      SUM(CASE WHEN type='IN' THEN qty ELSE 0 END) AS in_qty,
      SUM(CASE WHEN type='OUT' THEN qty ELSE 0 END) AS out_qty,
      SUM(CASE WHEN type='ADJUST' THEN qty ELSE 0 END) AS adjust_qty,
      COUNT(*) AS tx_count
     FROM stock_tx
     WHERE warehouse_id=? AND ${sqlBjDate('created_at')}=date(?)`
  ).bind(warehouseId, day).first<any>();
  return {
    in_qty: Number(sum?.in_qty || 0),
    out_qty: Number(sum?.out_qty || 0),
    adjust_qty: Number(sum?.adjust_qty || 0),
    tx_count: Number(sum?.tx_count || 0),
  };
}

async function upsertDaySnapshot(db: D1Database, mode: DashboardMode, day: string, warehouseId: number, scope: UserDataScope | null | undefined, metrics: Record<string, number>) {
  await db.prepare(
    `INSERT INTO report_daily_snapshots (snapshot_date, mode, warehouse_id, scope_key, metrics_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ${sqlNowStored()}, ${sqlNowStored()})
     ON CONFLICT(snapshot_date, mode, warehouse_id, scope_key)
     DO UPDATE SET metrics_json=excluded.metrics_json, updated_at=${sqlNowStored()}`
  ).bind(day, mode, warehouseId, scopeKey(scope), JSON.stringify(metrics || {})).run();
}

export async function ensureDashboardSnapshots(db: D1Database, params: { mode: DashboardMode; from: string; to: string; warehouseId?: number | null; scope?: UserDataScope | null }) {
  await ensureReportSnapshotTable(db);
  const days = listDays(params.from, params.to);
  const warehouseId = params.mode === 'parts' ? Number(params.warehouseId || 1) : 0;
  const key = scopeKey(params.scope);
  const placeholders = days.map(() => '?').join(',');
  const existing = await db.prepare(
    `SELECT snapshot_date FROM report_daily_snapshots WHERE mode=? AND COALESCE(warehouse_id,0)=COALESCE(?,0) AND scope_key=? AND snapshot_date IN (${placeholders})`
  ).bind(params.mode, warehouseId, key, ...days).all<any>();
  const done = new Set((existing.results || []).map((row: any) => String(row?.snapshot_date || '')));
  for (const day of days) {
    if (done.has(day)) continue;
    const metrics = params.mode === 'pc'
      ? await computePcDay(db, day, params.scope)
      : await computePartsDay(db, day, warehouseId || 1, params.scope);
    await upsertDaySnapshot(db, params.mode, day, warehouseId, params.scope, metrics);
  }
}

export async function readDashboardSnapshots(db: D1Database, params: { mode: DashboardMode; from: string; to: string; warehouseId?: number | null; scope?: UserDataScope | null }): Promise<DailySnapshotRow[]> {
  await ensureDashboardSnapshots(db, params);
  const warehouseId = params.mode === 'parts' ? Number(params.warehouseId || 1) : 0;
  const key = scopeKey(params.scope);
  const { results } = await db.prepare(
    `SELECT snapshot_date, metrics_json
     FROM report_daily_snapshots
     WHERE mode=? AND COALESCE(warehouse_id,0)=COALESCE(?,0) AND scope_key=? AND snapshot_date BETWEEN date(?) AND date(?)
     ORDER BY snapshot_date ASC`
  ).bind(params.mode, warehouseId, key, params.from, params.to).all<any>();
  return (results || []).map((row: any) => ({ day: String(row?.snapshot_date || ''), metrics: parseMetrics(row?.metrics_json) }));
}
