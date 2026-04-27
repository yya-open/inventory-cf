import { sqlBjDate } from '../_time';
import { readDashboardSnapshots, refreshDashboardSnapshots } from './report-snapshot';
import { resolvePartsWarehouseId, scopeAllowsAssetWarehouse, type UserDataScope } from './data-scope';

export type DashboardMode = 'parts' | 'pc' | 'monitor';

export function ymdInShanghai(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const ymd = `${get('year')}-${get('month')}-${get('day')}`;
  if (!offsetDays) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function parseDashboardParams(request: Request) {
  const url = new URL(request.url);
  const requestedWarehouseId = Number(url.searchParams.get('warehouse_id') ?? 1);
  const days = Math.max(1, Math.min(180, Number(url.searchParams.get('days') ?? 30) || 30));
  const mode = (url.searchParams.get('mode') || 'parts').toLowerCase() as DashboardMode;
  const to = url.searchParams.get('to') ?? ymdInShanghai(0);
  const from = url.searchParams.get('from') ?? ymdInShanghai(-(days - 1));
  return { url, requestedWarehouseId, days, mode, from, to };
}

async function firstNumber(db: D1Database, sql: string, binds: any[] = []) {
  const row = await db.prepare(sql).bind(...binds).first<any>().catch(() => ({ c: 0 }));
  return Number(row?.c || 0);
}

function departmentScopeValue(scope?: UserDataScope | null) {
  return scope?.data_scope_type === 'department' || scope?.data_scope_type === 'department_warehouse'
    ? String(scope?.data_scope_value || '').trim()
    : '';
}

export function snapshotSum(rows: Array<{ metrics: Record<string, number> }>, key: string) {
  return rows.reduce((sum, row) => sum + Number(row?.metrics?.[key] || 0), 0);
}

export function snapshotDaily(rows: Array<{ day: string; metrics: Record<string, number> }>, key: string) {
  return rows.map((row) => ({ day: row.day, qty: Number(row?.metrics?.[key] || 0) }));
}

export function responseScope(user: UserDataScope) {
  return {
    data_scope_type: user.data_scope_type || 'all',
    data_scope_value: user.data_scope_value || null,
    data_scope_value2: user.data_scope_value2 || null,
  };
}

export async function buildStability(db: D1Database) {
  const [failed_async_jobs, error_5xx_last_24h, active_alert_count, lastBackupDrill, openDrill, overdueDrill] = await Promise.all([
    firstNumber(db, `SELECT COUNT(*) AS c FROM async_jobs WHERE status='failed'`),
    firstNumber(db, `SELECT COUNT(*) AS c FROM request_error_log WHERE created_at >= datetime('now','+8 hours','-1 day') AND status >= 500`),
    firstNumber(db, `SELECT COUNT(*) AS c FROM async_jobs WHERE status IN ('failed','queued','running')`),
    db.prepare(`SELECT drill_at, outcome FROM backup_drill_runs ORDER BY id DESC LIMIT 1`).first<any>().catch(() => null),
    firstNumber(db, `SELECT COUNT(*) AS c FROM backup_drill_runs WHERE follow_up_status='open'`),
    firstNumber(db, `SELECT COUNT(*) AS c FROM backup_drill_runs WHERE follow_up_status='open' AND rect_due_at IS NOT NULL AND date(rect_due_at) < date('now','+8 hours')`),
  ]);
  return {
    failed_async_jobs,
    error_5xx_last_24h,
    active_alert_count,
    last_backup_drill_at: lastBackupDrill?.drill_at || null,
    last_backup_drill_outcome: lastBackupDrill?.outcome || null,
    open_drill_issue_count: openDrill,
    overdue_drill_issue_count: overdueDrill,
  };
}

export async function buildGovernance(db: D1Database, scope?: UserDataScope | null, from?: string, to?: string) {
  const departmentScope = departmentScopeValue(scope);
  const pcAllowed = scopeAllowsAssetWarehouse(scope, '电脑仓');
  const monitorAllowed = scopeAllowsAssetWarehouse(scope, '显示器仓');
  const pcDeptJoin = departmentScope ? `LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id` : '';
  const pcDeptWhere = departmentScope ? `WHERE COALESCE(s.current_department,'')=?` : '';
  const pcBind = departmentScope ? [departmentScope] : [];
  const monitorWhere = departmentScope ? `WHERE COALESCE(a.department,'')=?` : '';
  const monitorBind = departmentScope ? [departmentScope] : [];
  const archiveActions = [pcAllowed ? 'PC_ASSET_ARCHIVE' : null, monitorAllowed ? 'MONITOR_ASSET_ARCHIVE' : null].filter(Boolean) as string[];
  const restoreActions = [pcAllowed ? 'PC_ASSET_RESTORE' : null, monitorAllowed ? 'MONITOR_ASSET_RESTORE' : null].filter(Boolean) as string[];
  const purgeActions = [pcAllowed ? 'PC_ASSET_PURGE' : null, monitorAllowed ? 'MONITOR_ASSET_PURGE' : null].filter(Boolean) as string[];
  const auditCount = (actions: string[]) => actions.length
    ? firstNumber(db, `SELECT COUNT(*) AS c FROM audit_log WHERE action IN (${actions.map(() => '?').join(',')}) AND ${sqlBjDate('created_at')} BETWEEN date(?) AND date(?)`, [...actions, from, to])
    : 0;
  const [archived_pc_count, archived_monitor_count, total_pc_count, total_monitor_count, archive_events_30d, restore_events_30d, purge_events_30d] = await Promise.all([
    pcAllowed ? firstNumber(db, `SELECT COUNT(*) AS c FROM pc_assets a ${pcDeptJoin} ${pcDeptWhere ? `${pcDeptWhere} AND COALESCE(a.archived,0)=1` : `WHERE COALESCE(a.archived,0)=1`}`, pcBind) : 0,
    monitorAllowed ? firstNumber(db, `SELECT COUNT(*) AS c FROM monitor_assets a ${monitorWhere ? `${monitorWhere} AND COALESCE(a.archived,0)=1` : `WHERE COALESCE(a.archived,0)=1`}`, monitorBind) : 0,
    pcAllowed ? firstNumber(db, `SELECT COUNT(*) AS c FROM pc_assets a ${pcDeptJoin} ${pcDeptWhere}`, pcBind) : 0,
    monitorAllowed ? firstNumber(db, `SELECT COUNT(*) AS c FROM monitor_assets a ${monitorWhere}`, monitorBind) : 0,
    auditCount(archiveActions),
    auditCount(restoreActions),
    auditCount(purgeActions),
  ]);
  return {
    archived_pc_count,
    archived_monitor_count,
    total_pc_count,
    total_monitor_count,
    archive_events_30d,
    restore_events_30d,
    purge_events_30d,
  };
}

export async function getDashboardSummary(db: D1Database, user: UserDataScope, params: { requestedWarehouseId: number; days: number; mode: DashboardMode; from: string; to: string }) {
  const { requestedWarehouseId, days, mode, from, to } = params;
  const stability = await buildStability(db);
  const governance = await buildGovernance(db, user, from, to);

  if (mode === 'pc') {
    if (!scopeAllowsAssetWarehouse(user, '电脑仓')) throw Object.assign(new Error('当前账号的数据范围未包含电脑仓，看板不可访问'), { status: 403 });
    const snapshots = await readDashboardSnapshots(db, { mode: 'pc', from, to, scope: user });
    const summary = {
      in_qty: snapshotSum(snapshots, 'in_qty'),
      out_qty: snapshotSum(snapshots, 'out_qty'),
      recycle_qty: snapshotSum(snapshots, 'return_qty') + snapshotSum(snapshots, 'recycle_qty'),
      scrap_qty: snapshotSum(snapshots, 'scrap_qty'),
      adjust_qty: snapshotSum(snapshots, 'return_qty') + snapshotSum(snapshots, 'recycle_qty'),
      tx_count: snapshotSum(snapshots, 'tx_count'),
    };
    return {
      ok: true,
      mode: 'pc',
      range: { from, to, days },
      scope: responseScope(user),
      snapshot: { source: 'report_daily_snapshots', day_count: snapshots.length },
      summary,
      governance,
      stability,
      daily_out: snapshotDaily(snapshots, 'out_qty'),
      daily_in: snapshotDaily(snapshots, 'in_qty'),
      daily_return: snapshotDaily(snapshots, 'return_qty'),
      daily_recycle: snapshotDaily(snapshots, 'recycle_qty'),
      daily_scrap: snapshotDaily(snapshots, 'scrap_qty'),
    };
  }

  if (mode === 'monitor') {
    if (!scopeAllowsAssetWarehouse(user, '显示器仓')) throw Object.assign(new Error('当前账号的数据范围未包含显示器仓，看板不可访问'), { status: 403 });
    const snapshots = await readDashboardSnapshots(db, { mode: 'monitor', from, to, scope: user });
    const summary = {
      in_qty: snapshotSum(snapshots, 'in_qty'),
      out_qty: snapshotSum(snapshots, 'out_qty'),
      return_qty: snapshotSum(snapshots, 'return_qty'),
      transfer_qty: snapshotSum(snapshots, 'transfer_qty'),
      scrap_qty: snapshotSum(snapshots, 'scrap_qty'),
      tx_count: snapshotSum(snapshots, 'tx_count'),
    };
    return {
      ok: true,
      mode: 'monitor',
      range: { from, to, days },
      scope: responseScope(user),
      snapshot: { source: 'report_daily_snapshots', day_count: snapshots.length },
      summary,
      governance,
      stability,
      daily_out: snapshotDaily(snapshots, 'out_qty'),
      daily_in: snapshotDaily(snapshots, 'in_qty'),
      daily_return: snapshotDaily(snapshots, 'return_qty'),
      daily_transfer: snapshotDaily(snapshots, 'transfer_qty'),
      daily_scrap: snapshotDaily(snapshots, 'scrap_qty'),
    };
  }

  if (departmentScopeValue(user)) {
    throw Object.assign(new Error(`当前账号的数据可见范围包含部门：${departmentScopeValue(user)}，配件仓看板暂不支持按部门隔离，请切换到电脑仓/显示器仓看板或改为按仓库授权`), { status: 403 });
  }
  if (!scopeAllowsAssetWarehouse(user, '配件仓')) throw Object.assign(new Error('当前账号的数据范围未包含配件仓，看板不可访问'), { status: 403 });
  const warehouse_id = await resolvePartsWarehouseId(db, user, requestedWarehouseId);
  if (warehouse_id <= 0) throw Object.assign(new Error('当前账号未授权访问该配件仓'), { status: 403 });
  const snapshots = await readDashboardSnapshots(db, { mode: 'parts', from, to, warehouseId: warehouse_id, scope: user });
  const summary = {
    in_qty: snapshotSum(snapshots, 'in_qty'),
    out_qty: snapshotSum(snapshots, 'out_qty'),
    adjust_qty: snapshotSum(snapshots, 'adjust_qty'),
    tx_count: snapshotSum(snapshots, 'tx_count'),
  };
  return {
    ok: true,
    mode: 'parts',
    range: { from, to, days },
    scope: responseScope(user),
    snapshot: { source: 'report_daily_snapshots', day_count: snapshots.length },
    summary,
    governance,
    stability,
    daily_out: snapshotDaily(snapshots, 'out_qty'),
    daily_in: snapshotDaily(snapshots, 'in_qty'),
  };
}

export async function getDashboardDetail(db: D1Database, user: UserDataScope, params: { requestedWarehouseId: number; days: number; mode: DashboardMode; from: string; to: string }) {
  const { requestedWarehouseId, days, mode, from, to } = params;
  const departmentScope = departmentScopeValue(user);

  if (mode === 'pc') {
    if (!scopeAllowsAssetWarehouse(user, '电脑仓')) throw Object.assign(new Error('当前账号的数据范围未包含电脑仓，看板不可访问'), { status: 403 });
    const scopeJoin = departmentScope ? `JOIN pc_asset_latest_state s ON s.asset_id=t.asset_id` : '';
    const scopeWhere = departmentScope ? ` AND COALESCE(s.current_department,'')=?` : '';
    const scopeBinds = departmentScope ? [departmentScope] : [];
    const qTopPc = (table: string, whereExtra = '') => db.prepare(
      `SELECT COALESCE(NULLIF(model,''),'(未填型号)') AS sku,
              COALESCE(NULLIF(brand,''),'') || CASE WHEN brand IS NOT NULL AND brand<>'' THEN ' · ' ELSE '' END || COALESCE(NULLIF(serial_no,''),'(无SN)') AS name,
              COUNT(*) AS qty
       FROM ${table} t ${scopeJoin}
       WHERE ${sqlBjDate('t.created_at')} BETWEEN date(?) AND date(?) ${scopeWhere} ${whereExtra}
       GROUP BY COALESCE(NULLIF(model,''),'(未填型号)'), COALESCE(NULLIF(brand,''),''), COALESCE(NULLIF(serial_no,''),'(无SN)')
       ORDER BY qty DESC, MAX(created_at) DESC
       LIMIT 10`
    );
    const qCatPc = (table: string, catExpr: string, whereExtra = '') => db.prepare(
      `SELECT ${catExpr} AS category, COUNT(*) AS qty
       FROM ${table} t ${scopeJoin}
       WHERE ${sqlBjDate('t.created_at')} BETWEEN date(?) AND date(?) ${scopeWhere} ${whereExtra}
       GROUP BY category ORDER BY qty DESC LIMIT 20`
    );
    const [{ results: topOut }, { results: topIn }, { results: topReturn }, { results: topRecycle }, { results: topScrap }, { results: catOut }, { results: catIn }, { results: catReturn }, { results: catRecycle }, { results: catScrap }] = await Promise.all([
      qTopPc('pc_out').bind(from, to, ...scopeBinds).all<any>(),
      qTopPc('pc_in').bind(from, to, ...scopeBinds).all<any>(),
      qTopPc('pc_recycle', `AND UPPER(COALESCE(action,''))='RETURN'`).bind(from, to, ...scopeBinds).all<any>(),
      qTopPc('pc_recycle', `AND UPPER(COALESCE(action,''))='RECYCLE'`).bind(from, to, ...scopeBinds).all<any>(),
      qTopPc('pc_scrap').bind(from, to, ...scopeBinds).all<any>(),
      qCatPc('pc_out', `COALESCE(NULLIF(t.department,''),'未填部门')`).bind(from, to, ...scopeBinds).all<any>(),
      qCatPc('pc_in', `COALESCE(NULLIF(t.brand,''),'未填品牌')`).bind(from, to, ...scopeBinds).all<any>(),
      qCatPc('pc_recycle', `COALESCE(NULLIF(t.department,''),'未填部门')`, `AND UPPER(COALESCE(t.action,''))='RETURN'`).bind(from, to, ...scopeBinds).all<any>(),
      qCatPc('pc_recycle', `COALESCE(NULLIF(t.department,''),'未填部门')`, `AND UPPER(COALESCE(t.action,''))='RECYCLE'`).bind(from, to, ...scopeBinds).all<any>(),
      qCatPc('pc_scrap', `COALESCE(NULLIF(t.reason,''),'未填原因')`).bind(from, to, ...scopeBinds).all<any>(),
    ]);
    return { ok: true, mode: 'pc', range: { from, to, days }, top_out: topOut || [], top_in: topIn || [], top_return: topReturn || [], top_recycle: topRecycle || [], top_scrap: topScrap || [], category_out: catOut || [], category_in: catIn || [], category_return: catReturn || [], category_recycle: catRecycle || [], category_scrap: catScrap || [] };
  }

  if (mode === 'monitor') {
    if (!scopeAllowsAssetWarehouse(user, '显示器仓')) throw Object.assign(new Error('当前账号的数据范围未包含显示器仓，看板不可访问'), { status: 403 });
    const scopeWhere = departmentScope ? ` AND COALESCE(t.department,'')=?` : '';
    const scopeBinds = departmentScope ? [departmentScope] : [];
    const qTopMonitor = (txType: string) => db.prepare(
      `SELECT COALESCE(NULLIF(t.model,''),'(未填型号)') AS sku,
              COALESCE(NULLIF(t.brand,''),'') || CASE WHEN t.brand IS NOT NULL AND t.brand<>'' THEN ' · ' ELSE '' END || COALESCE(NULLIF(t.sn,''),'(无SN)') AS name,
              COUNT(*) AS qty
       FROM monitor_tx t
       WHERE t.tx_type=? AND ${sqlBjDate('t.created_at')} BETWEEN date(?) AND date(?) ${scopeWhere}
       GROUP BY COALESCE(NULLIF(t.model,''),'(未填型号)'), COALESCE(NULLIF(t.brand,''),''), COALESCE(NULLIF(t.sn,''),'(无SN)')
       ORDER BY qty DESC, MAX(t.created_at) DESC
       LIMIT 10`
    ).bind(txType, from, to, ...scopeBinds).all<any>();
    const qCatMonitor = (txType: string, expr: string) => db.prepare(
      `SELECT ${expr} AS category, COUNT(*) AS qty
       FROM monitor_tx t
       WHERE t.tx_type=? AND ${sqlBjDate('t.created_at')} BETWEEN date(?) AND date(?) ${scopeWhere}
       GROUP BY category ORDER BY qty DESC LIMIT 20`
    ).bind(txType, from, to, ...scopeBinds).all<any>();
    const [topOut, topIn, topReturn, topTransfer, topScrap, catOut, catIn, catReturn, catTransfer, catScrap] = await Promise.all([
      qTopMonitor('OUT').then((r) => r.results || []),
      qTopMonitor('IN').then((r) => r.results || []),
      qTopMonitor('RETURN').then((r) => r.results || []),
      qTopMonitor('TRANSFER').then((r) => r.results || []),
      qTopMonitor('SCRAP').then((r) => r.results || []),
      qCatMonitor('OUT', `COALESCE(NULLIF(t.department,''),'未填部门')`).then((r) => r.results || []),
      qCatMonitor('IN', `COALESCE(NULLIF(t.brand,''),'未填品牌')`).then((r) => r.results || []),
      qCatMonitor('RETURN', `COALESCE(NULLIF(t.department,''),'未填部门')`).then((r) => r.results || []),
      qCatMonitor('TRANSFER', `COALESCE(NULLIF(t.department,''),'未填部门')`).then((r) => r.results || []),
      qCatMonitor('SCRAP', `COALESCE(NULLIF(t.remark,''),'未填原因')`).then((r) => r.results || []),
    ]);
    return { ok: true, mode: 'monitor', range: { from, to, days }, top_out: topOut, top_in: topIn, top_return: topReturn, top_transfer: topTransfer, top_scrap: topScrap, category_out: catOut, category_in: catIn, category_return: catReturn, category_transfer: catTransfer, category_scrap: catScrap };
  }

  if (departmentScope) throw Object.assign(new Error(`当前账号的数据可见范围包含部门：${departmentScope}，配件仓看板暂不支持按部门隔离，请切换到电脑仓/显示器仓看板或改为按仓库授权`), { status: 403 });
  if (!scopeAllowsAssetWarehouse(user, '配件仓')) throw Object.assign(new Error('当前账号的数据范围未包含配件仓，看板不可访问'), { status: 403 });
  const warehouse_id = await resolvePartsWarehouseId(db, user, requestedWarehouseId);
  if (warehouse_id <= 0) throw Object.assign(new Error('当前账号未授权访问该配件仓'), { status: 403 });
  const [{ results: topOut }, { results: topIn }, { results: catOut }, { results: catIn }] = await Promise.all([
    db.prepare(
      `SELECT i.sku, i.name, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='OUT' AND ${sqlBjDate('t.created_at')} BETWEEN date(?) AND date(?)
       GROUP BY t.item_id
       ORDER BY qty DESC
       LIMIT 10`
    ).bind(warehouse_id, from, to).all<any>(),
    db.prepare(
      `SELECT i.sku, i.name, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='IN' AND ${sqlBjDate('t.created_at')} BETWEEN date(?) AND date(?)
       GROUP BY t.item_id
       ORDER BY qty DESC
       LIMIT 10`
    ).bind(warehouse_id, from, to).all<any>(),
    db.prepare(
      `SELECT COALESCE(i.category,'未分类') AS category, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='OUT' AND ${sqlBjDate('t.created_at')} BETWEEN date(?) AND date(?)
       GROUP BY category
       ORDER BY qty DESC
       LIMIT 20`
    ).bind(warehouse_id, from, to).all<any>(),
    db.prepare(
      `SELECT COALESCE(i.category,'未分类') AS category, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='IN' AND ${sqlBjDate('t.created_at')} BETWEEN date(?) AND date(?)
       GROUP BY category
       ORDER BY qty DESC
       LIMIT 20`
    ).bind(warehouse_id, from, to).all<any>(),
  ]);
  return { ok: true, mode: 'parts', range: { from, to, days }, top_out: topOut || [], top_in: topIn || [], category_out: catOut || [], category_in: catIn || [] };
}

export async function precomputeDashboardSnapshots(db: D1Database, options?: { days?: number; force?: boolean }) {
  const days = Math.max(1, Math.min(180, Number(options?.days || 90) || 90));
  const to = ymdInShanghai(0);
  const from = ymdInShanghai(-(days - 1));
  const { results: userScopes } = await db.prepare(
    `SELECT DISTINCT data_scope_type, data_scope_value, data_scope_value2
     FROM users
     WHERE COALESCE(is_active,1)=1`
  ).all<any>().catch(() => ({ results: [] }));
  const scopes: UserDataScope[] = [{ data_scope_type: 'all', data_scope_value: null, data_scope_value2: null }];
  const seen = new Set<string>();
  for (const scope of userScopes || []) {
    const key = JSON.stringify({ t: scope?.data_scope_type || 'all', v: scope?.data_scope_value || null, v2: scope?.data_scope_value2 || null });
    if (seen.has(key)) continue;
    seen.add(key);
    scopes.push({ data_scope_type: (scope?.data_scope_type || 'all') as any, data_scope_value: scope?.data_scope_value || null, data_scope_value2: scope?.data_scope_value2 || null });
  }
  const warehouseRows = await db.prepare(`SELECT id FROM warehouses ORDER BY id ASC`).all<any>().catch(() => ({ results: [{ id: 1 }] }));
  const warehouseIds = (warehouseRows.results || []).map((row: any) => Number(row?.id || 0)).filter((id: number) => id > 0);
  const partsWarehouseIds = warehouseIds.length ? warehouseIds : [1];

  let runs = 0;
  for (const scope of scopes) {
    const hasDepartment = departmentScopeValue(scope);
    if (scopeAllowsAssetWarehouse(scope, '电脑仓')) {
      await refreshDashboardSnapshots(db, { mode: 'pc', from, to, scope }, { force: !!options?.force });
      runs += 1;
    }
    if (scopeAllowsAssetWarehouse(scope, '显示器仓')) {
      await refreshDashboardSnapshots(db, { mode: 'monitor', from, to, scope }, { force: !!options?.force });
      runs += 1;
    }
    if (!hasDepartment && scopeAllowsAssetWarehouse(scope, '配件仓')) {
      for (const warehouseId of partsWarehouseIds) {
        await refreshDashboardSnapshots(db, { mode: 'parts', from, to, warehouseId, scope }, { force: !!options?.force });
        runs += 1;
      }
    }
  }
  return { from, to, days, scope_count: scopes.length, warehouse_count: partsWarehouseIds.length, runs };
}
