import { sqlNowStored } from '../_time';
import { scopeAllowsAssetWarehouse, type UserDataScope } from './data-scope';

export type DashboardMode = 'pc' | 'parts' | 'monitor';
export type DailySnapshotRow = { day: string; metrics: Record<string, number> };

type MetricsByDay = Record<string, Record<string, number>>;

function addDays(day: string, offset: number) {
  const [y, m, d] = String(day || '').split('-').map((v) => Number(v || 0));
  const dt = new Date(Date.UTC(y || 1970, Math.max((m || 1) - 1, 0), d || 1));
  dt.setUTCDate(dt.getUTCDate() + offset);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function listDays(from: string, to: string) {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
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

function dayBounds(from: string, to: string) {
  return {
    startAt: `${from} 00:00:00`,
    endExclusive: `${addDays(to, 1)} 00:00:00`,
  };
}

function emptyMetrics(mode: DashboardMode) {
  if (mode === 'pc') return { in_qty: 0, out_qty: 0, return_qty: 0, recycle_qty: 0, scrap_qty: 0, tx_count: 0 };
  if (mode === 'monitor') return { in_qty: 0, out_qty: 0, return_qty: 0, transfer_qty: 0, scrap_qty: 0, tx_count: 0 };
  return { in_qty: 0, out_qty: 0, adjust_qty: 0, tx_count: 0 };
}

function initMetricMap(days: string[], mode: DashboardMode): MetricsByDay {
  const out: MetricsByDay = {};
  for (const day of days) out[day] = emptyMetrics(mode);
  return out;
}

function bumpMetric(target: MetricsByDay, day: string, key: string, qty: number) {
  if (!target[day]) return;
  target[day][key] = Number(qty || 0);
}

async function ensureStatementBatch(db: D1Database, statements: D1PreparedStatement[]) {
  if (!statements.length) return;
  await db.batch(statements.splice(0, statements.length));
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

async function computePcRange(db: D1Database, from: string, to: string, scope?: UserDataScope | null) {
  const days = listDays(from, to);
  const metrics = initMetricMap(days, 'pc');
  if (!scopeAllowsAssetWarehouse(scope, '电脑仓')) return metrics;
  const dept = scope?.data_scope_type === 'department' || scope?.data_scope_type === 'department_warehouse' ? String(scope?.data_scope_value || '').trim() : '';
  const { startAt, endExclusive } = dayBounds(from, to);
  const join = dept ? `JOIN pc_asset_latest_state s ON s.asset_id=t.asset_id` : '';
  const scopeWhere = dept ? ` AND TRIM(COALESCE(s.current_department,''))=?` : '';
  const scopeBinds = dept ? [dept] : [];
  const rowsFor = async (table: string, key: string, extraWhere = '') => {
    const { results } = await db.prepare(
      `SELECT substr(t.created_at,1,10) AS day, COUNT(*) AS qty
       FROM ${table} t ${join}
       WHERE t.created_at >= ? AND t.created_at < ? ${scopeWhere} ${extraWhere}
       GROUP BY substr(t.created_at,1,10)`
    ).bind(startAt, endExclusive, ...scopeBinds).all<any>();
    for (const row of results || []) bumpMetric(metrics, String(row?.day || ''), key, Number(row?.qty || 0));
  };
  await Promise.all([
    rowsFor('pc_in', 'in_qty'),
    rowsFor('pc_out', 'out_qty'),
    rowsFor('pc_recycle', 'return_qty', `AND UPPER(COALESCE(t.action,''))='RETURN'`),
    rowsFor('pc_recycle', 'recycle_qty', `AND UPPER(COALESCE(t.action,''))='RECYCLE'`),
    rowsFor('pc_scrap', 'scrap_qty'),
  ]);
  for (const day of days) {
    const row = metrics[day];
    row.tx_count = Number(row.in_qty || 0) + Number(row.out_qty || 0) + Number(row.return_qty || 0) + Number(row.recycle_qty || 0) + Number(row.scrap_qty || 0);
  }
  return metrics;
}

async function computeMonitorRange(db: D1Database, from: string, to: string, scope?: UserDataScope | null) {
  const days = listDays(from, to);
  const metrics = initMetricMap(days, 'monitor');
  if (!scopeAllowsAssetWarehouse(scope, '显示器仓')) return metrics;
  const dept = scope?.data_scope_type === 'department' || scope?.data_scope_type === 'department_warehouse' ? String(scope?.data_scope_value || '').trim() : '';
  const { startAt, endExclusive } = dayBounds(from, to);
  const where = dept ? ` AND TRIM(COALESCE(department,''))=?` : '';
  const binds = dept ? [dept] : [];
  const { results } = await db.prepare(
    `SELECT substr(created_at,1,10) AS day,
            SUM(CASE WHEN tx_type='IN' THEN 1 ELSE 0 END) AS in_qty,
            SUM(CASE WHEN tx_type='OUT' THEN 1 ELSE 0 END) AS out_qty,
            SUM(CASE WHEN tx_type='RETURN' THEN 1 ELSE 0 END) AS return_qty,
            SUM(CASE WHEN tx_type='TRANSFER' THEN 1 ELSE 0 END) AS transfer_qty,
            SUM(CASE WHEN tx_type='SCRAP' THEN 1 ELSE 0 END) AS scrap_qty,
            COUNT(*) AS tx_count
     FROM monitor_tx
     WHERE created_at >= ? AND created_at < ? ${where}
     GROUP BY substr(created_at,1,10)`
  ).bind(startAt, endExclusive, ...binds).all<any>();
  for (const row of results || []) {
    const day = String(row?.day || '');
    if (!metrics[day]) continue;
    metrics[day] = {
      in_qty: Number(row?.in_qty || 0),
      out_qty: Number(row?.out_qty || 0),
      return_qty: Number(row?.return_qty || 0),
      transfer_qty: Number(row?.transfer_qty || 0),
      scrap_qty: Number(row?.scrap_qty || 0),
      tx_count: Number(row?.tx_count || 0),
    };
  }
  return metrics;
}

async function computePartsRange(db: D1Database, from: string, to: string, warehouseId: number, scope?: UserDataScope | null) {
  const days = listDays(from, to);
  const metrics = initMetricMap(days, 'parts');
  if (!scopeAllowsAssetWarehouse(scope, '配件仓')) return metrics;
  const { startAt, endExclusive } = dayBounds(from, to);
  const { results } = await db.prepare(
    `SELECT substr(created_at,1,10) AS day,
            SUM(CASE WHEN type='IN' THEN qty ELSE 0 END) AS in_qty,
            SUM(CASE WHEN type='OUT' THEN qty ELSE 0 END) AS out_qty,
            SUM(CASE WHEN type='ADJUST' THEN qty ELSE 0 END) AS adjust_qty,
            COUNT(*) AS tx_count
     FROM stock_tx
     WHERE warehouse_id=? AND created_at >= ? AND created_at < ?
     GROUP BY substr(created_at,1,10)`
  ).bind(warehouseId, startAt, endExclusive).all<any>();
  for (const row of results || []) {
    const day = String(row?.day || '');
    if (!metrics[day]) continue;
    metrics[day] = {
      in_qty: Number(row?.in_qty || 0),
      out_qty: Number(row?.out_qty || 0),
      adjust_qty: Number(row?.adjust_qty || 0),
      tx_count: Number(row?.tx_count || 0),
    };
  }
  return metrics;
}

async function computeMetricsByDay(db: D1Database, params: { mode: DashboardMode; from: string; to: string; warehouseId: number; scope?: UserDataScope | null }) {
  if (params.mode === 'pc') return computePcRange(db, params.from, params.to, params.scope);
  if (params.mode === 'monitor') return computeMonitorRange(db, params.from, params.to, params.scope);
  return computePartsRange(db, params.from, params.to, params.warehouseId, params.scope);
}

async function upsertSnapshots(db: D1Database, params: { mode: DashboardMode; from: string; to: string; warehouseId: number; scope?: UserDataScope | null }, metrics: MetricsByDay, options?: { onlyDays?: Set<string> }) {
  const days = listDays(params.from, params.to);
  const statements: D1PreparedStatement[] = [];
  for (const day of days) {
    if (options?.onlyDays && !options.onlyDays.has(day)) continue;
    statements.push(db.prepare(
      `INSERT INTO report_daily_snapshots (snapshot_date, mode, warehouse_id, scope_key, metrics_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ${sqlNowStored()}, ${sqlNowStored()})
       ON CONFLICT(snapshot_date, mode, warehouse_id, scope_key)
       DO UPDATE SET metrics_json=excluded.metrics_json, updated_at=${sqlNowStored()}`
    ).bind(day, params.mode, params.warehouseId, scopeKey(params.scope), JSON.stringify(metrics[day] || emptyMetrics(params.mode))));
    if (statements.length >= 100) await ensureStatementBatch(db, statements);
  }
  await ensureStatementBatch(db, statements);
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
  if (done.size >= days.length) return;
  const pendingDays = new Set(days.filter((day) => !done.has(day)));
  const metrics = await computeMetricsByDay(db, { mode: params.mode, from: params.from, to: params.to, warehouseId, scope: params.scope });
  await upsertSnapshots(db, { mode: params.mode, from: params.from, to: params.to, warehouseId, scope: params.scope }, metrics, { onlyDays: pendingDays });
}

export async function refreshDashboardSnapshots(
  db: D1Database,
  params: { mode: DashboardMode; from: string; to: string; warehouseId?: number | null; scope?: UserDataScope | null },
  options?: { force?: boolean },
) {
  await ensureReportSnapshotTable(db);
  const warehouseId = params.mode === 'parts' ? Number(params.warehouseId || 1) : 0;
  const key = scopeKey(params.scope);
  if (options?.force) {
    await db.prepare(
      `DELETE FROM report_daily_snapshots WHERE mode=? AND COALESCE(warehouse_id,0)=COALESCE(?,0) AND scope_key=? AND snapshot_date BETWEEN date(?) AND date(?)`
    ).bind(params.mode, warehouseId, key, params.from, params.to).run();
  }
  const metrics = await computeMetricsByDay(db, { mode: params.mode, from: params.from, to: params.to, warehouseId, scope: params.scope });
  await upsertSnapshots(db, { mode: params.mode, from: params.from, to: params.to, warehouseId, scope: params.scope }, metrics);
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
