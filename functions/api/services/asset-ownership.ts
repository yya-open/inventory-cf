import { applyDepartmentDataScopeClause, assertMonitorAssetDataScopeAccess, assertPcAssetDataScopeAccess, scopeAllowsAssetWarehouse, type UserDataScope } from './data-scope';

export type AssetOwnershipKind = 'all' | 'pc' | 'monitor';
export type AssetOwnershipGroupBy = 'person' | 'department';

export type AssetOwnershipAsset = {
  kind: 'pc' | 'monitor';
  id: number;
  asset_code: string;
  serial_no?: string | null;
  brand?: string | null;
  model?: string | null;
  status?: string | null;
  employee_no?: string | null;
  employee_name?: string | null;
  department?: string | null;
  assigned_at?: string | null;
  location_name?: string | null;
  parent_location_name?: string | null;
  inventory_status?: string | null;
  inventory_at?: string | null;
};

export type AssetOwnershipGroup = {
  key: string;
  label: string;
  employee_no?: string | null;
  employee_name?: string | null;
  department?: string | null;
  pc_count: number;
  monitor_count: number;
  total: number;
  assets: AssetOwnershipAsset[];
};

export type AssetLifecycleEvent = {
  id: string;
  kind: 'pc' | 'monitor';
  asset_id: number;
  category: 'asset' | 'movement' | 'inventory' | 'archive';
  action: string;
  title: string;
  occurred_at?: string | null;
  created_by?: string | null;
  reference_no?: string | null;
  employee_no?: string | null;
  employee_name?: string | null;
  department?: string | null;
  location_name?: string | null;
  from_location_name?: string | null;
  to_location_name?: string | null;
  remark?: string | null;
  status?: string | null;
  issue_type?: string | null;
};

const PC_WAREHOUSE = '电脑仓';
const MONITOR_WAREHOUSE = '显示器仓';

function parseKind(value: string | null | undefined): AssetOwnershipKind {
  const normalized = String(value || 'all').trim().toLowerCase();
  return normalized === 'pc' || normalized === 'monitor' ? normalized : 'all';
}

export function parseOwnershipQuery(url: URL): { groupBy: AssetOwnershipGroupBy; kind: AssetOwnershipKind; keyword: string; limit: number } {
  const groupBy: AssetOwnershipGroupBy = String(url.searchParams.get('group_by') || '').trim().toLowerCase() === 'department' ? 'department' : 'person';
  const kind = parseKind(url.searchParams.get('kind'));
  const keyword = String(url.searchParams.get('keyword') || '').trim();
  const limit = Math.min(800, Math.max(50, Number(url.searchParams.get('limit') || 400) || 400));
  return { groupBy, kind, keyword, limit };
}

function addKeywordClause(clauses: string[], binds: any[], keyword: string, columns: string[]) {
  if (!keyword) return;
  const like = `%${keyword.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
  clauses.push(`(${columns.map((column) => `COALESCE(${column}, '') LIKE ? ESCAPE '\\'`).join(' OR ')})`);
  binds.push(...columns.map(() => like));
}

function normalizeText(value: unknown, fallback = '未填写') {
  const text = String(value || '').trim();
  return text || fallback;
}

function groupAssetKey(asset: AssetOwnershipAsset, groupBy: AssetOwnershipGroupBy) {
  if (groupBy === 'department') return normalizeText(asset.department);
  const no = String(asset.employee_no || '').trim();
  const name = String(asset.employee_name || '').trim();
  return no || name || '未填写';
}

function groupAssetLabel(asset: AssetOwnershipAsset, groupBy: AssetOwnershipGroupBy) {
  if (groupBy === 'department') return normalizeText(asset.department);
  const no = String(asset.employee_no || '').trim();
  const name = String(asset.employee_name || '').trim();
  if (name && no) return `${name} (${no})`;
  return name || no || '未填写';
}

function sortAssets(a: AssetOwnershipAsset, b: AssetOwnershipAsset) {
  const at = String(a.assigned_at || '');
  const bt = String(b.assigned_at || '');
  if (at !== bt) return bt.localeCompare(at);
  return `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`);
}

function buildGroups(rows: AssetOwnershipAsset[], groupBy: AssetOwnershipGroupBy) {
  const map = new Map<string, AssetOwnershipGroup>();
  for (const asset of rows) {
    const key = groupAssetKey(asset, groupBy);
    const current = map.get(key) || {
      key,
      label: groupAssetLabel(asset, groupBy),
      employee_no: groupBy === 'person' ? asset.employee_no || null : null,
      employee_name: groupBy === 'person' ? asset.employee_name || null : null,
      department: asset.department || null,
      pc_count: 0,
      monitor_count: 0,
      total: 0,
      assets: [],
    };
    current.assets.push(asset);
    current.total += 1;
    if (asset.kind === 'pc') current.pc_count += 1;
    if (asset.kind === 'monitor') current.monitor_count += 1;
    if (!current.department && asset.department) current.department = asset.department;
    map.set(key, current);
  }
  return Array.from(map.values())
    .map((group) => ({ ...group, assets: group.assets.sort(sortAssets) }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

async function listPcOwnershipAssets(db: D1Database, scope: UserDataScope, keyword: string, limit: number) {
  if (!scopeAllowsAssetWarehouse(scope, PC_WAREHOUSE)) return [] as AssetOwnershipAsset[];
  const clauses = [
    'COALESCE(a.archived, 0)=0',
    "a.status='ASSIGNED'",
    "(COALESCE(s.current_employee_no, '')<>'' OR COALESCE(s.current_employee_name, '')<>'' OR COALESCE(s.current_department, '')<>'')",
  ];
  const binds: any[] = [];
  applyDepartmentDataScopeClause(clauses, binds, 's.current_department', scope);
  addKeywordClause(clauses, binds, keyword, [
    'a.serial_no',
    'a.brand',
    'a.model',
    's.current_employee_no',
    's.current_employee_name',
    's.current_department',
  ]);
  const result = await db.prepare(`
    SELECT
      'pc' AS kind,
      a.id,
      a.serial_no AS asset_code,
      a.serial_no,
      a.brand,
      a.model,
      a.status,
      s.current_employee_no AS employee_no,
      s.current_employee_name AS employee_name,
      s.current_department AS department,
      COALESCE(NULLIF(s.last_config_date, ''), s.last_out_at) AS assigned_at,
      NULL AS location_name,
      NULL AS parent_location_name,
      a.inventory_status,
      a.inventory_at
    FROM pc_assets a
    LEFT JOIN pc_asset_latest_state s ON s.asset_id = a.id
    WHERE ${clauses.join(' AND ')}
    ORDER BY assigned_at DESC, a.id ASC
    LIMIT ?
  `).bind(...binds, limit).all<AssetOwnershipAsset>();
  return result.results || [];
}

async function listMonitorOwnershipAssets(db: D1Database, scope: UserDataScope, keyword: string, limit: number) {
  if (!scopeAllowsAssetWarehouse(scope, MONITOR_WAREHOUSE)) return [] as AssetOwnershipAsset[];
  const clauses = [
    'COALESCE(a.archived, 0)=0',
    "a.status='ASSIGNED'",
    "(COALESCE(a.employee_no, '')<>'' OR COALESCE(a.employee_name, '')<>'' OR COALESCE(a.department, '')<>'')",
  ];
  const binds: any[] = [];
  applyDepartmentDataScopeClause(clauses, binds, 'a.department', scope);
  addKeywordClause(clauses, binds, keyword, [
    'a.asset_code',
    'a.sn',
    'a.brand',
    'a.model',
    'a.employee_no',
    'a.employee_name',
    'a.department',
    'loc.name',
  ]);
  const result = await db.prepare(`
    SELECT
      'monitor' AS kind,
      a.id,
      a.asset_code,
      a.sn AS serial_no,
      a.brand,
      a.model,
      a.status,
      a.employee_no,
      a.employee_name,
      a.department,
      (
        SELECT t.created_at
        FROM monitor_tx t
        WHERE t.asset_id = a.id AND t.tx_type IN ('OUT', 'TRANSFER')
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT 1
      ) AS assigned_at,
      loc.name AS location_name,
      parent_loc.name AS parent_location_name,
      a.inventory_status,
      a.inventory_at
    FROM monitor_assets a
    LEFT JOIN pc_locations loc ON loc.id = a.location_id
    LEFT JOIN pc_locations parent_loc ON parent_loc.id = loc.parent_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY assigned_at DESC, a.id ASC
    LIMIT ?
  `).bind(...binds, limit).all<AssetOwnershipAsset>();
  return result.results || [];
}

export async function getAssetOwnershipOverview(db: D1Database, scope: UserDataScope, url: URL) {
  const query = parseOwnershipQuery(url);
  const [pcAssets, monitorAssets] = await Promise.all([
    query.kind === 'monitor' ? Promise.resolve([]) : listPcOwnershipAssets(db, scope, query.keyword, query.limit),
    query.kind === 'pc' ? Promise.resolve([]) : listMonitorOwnershipAssets(db, scope, query.keyword, query.limit),
  ]);
  const assets = [...pcAssets, ...monitorAssets].sort(sortAssets).slice(0, query.limit);
  const groups = buildGroups(assets, query.groupBy);
  return {
    group_by: query.groupBy,
    kind: query.kind,
    keyword: query.keyword,
    groups,
    assets,
    summary: {
      groups: groups.length,
      total: assets.length,
      pc: assets.filter((item) => item.kind === 'pc').length,
      monitor: assets.filter((item) => item.kind === 'monitor').length,
    },
  };
}

function eventTime(value: any) {
  return String(value || '').trim() || null;
}

function compareEvents(a: AssetLifecycleEvent, b: AssetLifecycleEvent) {
  const at = String(a.occurred_at || '');
  const bt = String(b.occurred_at || '');
  if (at !== bt) return bt.localeCompare(at);
  return b.id.localeCompare(a.id);
}

export async function getPcAssetLifecycle(db: D1Database, scope: UserDataScope, assetId: number) {
  await assertPcAssetDataScopeAccess(db, scope, assetId, '电脑资产生命周期');
  const asset = await db.prepare(`
    SELECT
      a.*,
      s.current_employee_no AS employee_no,
      s.current_employee_name AS employee_name,
      s.current_department AS department,
      s.last_out_at,
      s.last_in_at,
      s.last_recycle_date AS last_recycle_at
    FROM pc_assets a
    LEFT JOIN pc_asset_latest_state s ON s.asset_id = a.id
    WHERE a.id=?
  `).bind(assetId).first<any>();
  if (!asset) return { asset: null, events: [] as AssetLifecycleEvent[] };
  const [txRows, inventoryRows] = await Promise.all([
    db.prepare(`
      SELECT * FROM (
        SELECT 'IN' AS action, id, in_no AS reference_no, asset_id, NULL AS employee_no, NULL AS employee_name, NULL AS department, remark, created_at, created_by, NULL AS status, NULL AS issue_type
        FROM pc_in WHERE asset_id=?
        UNION ALL
        SELECT 'OUT' AS action, id, out_no AS reference_no, asset_id, employee_no, employee_name, department, remark, COALESCE(NULLIF(config_date, ''), created_at) AS created_at, created_by, NULL AS status, NULL AS issue_type
        FROM pc_out WHERE asset_id=?
        UNION ALL
        SELECT action, id, recycle_no AS reference_no, asset_id, employee_no, employee_name, department, remark, COALESCE(NULLIF(recycle_date, ''), created_at) AS created_at, created_by, NULL AS status, NULL AS issue_type
        FROM pc_recycle WHERE asset_id=?
        UNION ALL
        SELECT 'SCRAP' AS action, id, scrap_no AS reference_no, asset_id, NULL AS employee_no, NULL AS employee_name, NULL AS department, COALESCE(reason, remark) AS remark, COALESCE(NULLIF(scrap_date, ''), created_at) AS created_at, created_by, 'SCRAPPED' AS status, NULL AS issue_type
        FROM pc_scrap WHERE asset_id=?
      )
      ORDER BY created_at DESC, id DESC
      LIMIT 200
    `).bind(assetId, assetId, assetId, assetId).all<any>(),
    db.prepare(`
      SELECT id, action, issue_type, remark, created_at
      FROM pc_inventory_log
      WHERE asset_id=?
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    `).bind(assetId).all<any>(),
  ]);
  const events: AssetLifecycleEvent[] = [
    {
      id: `pc-asset-${asset.id}`,
      kind: 'pc',
      asset_id: assetId,
      category: 'asset',
      action: 'CURRENT',
      title: '当前状态',
      occurred_at: eventTime(asset.updated_at || asset.created_at),
      status: asset.status,
      employee_no: asset.employee_no,
      employee_name: asset.employee_name,
      department: asset.department,
      remark: asset.archived ? asset.archived_reason : asset.remark,
    },
  ];
  if (asset.created_at) {
    events.push({
      id: `pc-created-${asset.id}`,
      kind: 'pc',
      asset_id: assetId,
      category: 'asset',
      action: 'CREATE',
      title: '资产建档',
      occurred_at: eventTime(asset.created_at),
      status: asset.status,
      remark: asset.remark,
    });
  }
  if (Number(asset.archived || 0) === 1) {
    events.push({
      id: `pc-archived-${asset.id}`,
      kind: 'pc',
      asset_id: assetId,
      category: 'archive',
      action: 'ARCHIVE',
      title: '资产归档',
      occurred_at: eventTime(asset.archived_at || asset.updated_at),
      created_by: asset.archived_by,
      remark: [asset.archived_reason, asset.archived_note].filter(Boolean).join(' / '),
    });
  }
  for (const row of txRows.results || []) {
    const action = String(row.action || '').toUpperCase();
    events.push({
      id: `pc-tx-${action}-${row.id}`,
      kind: 'pc',
      asset_id: assetId,
      category: 'movement',
      action,
      title: action === 'IN' ? '入库' : action === 'OUT' ? '领用出库' : action === 'RETURN' ? '归还' : action === 'RECYCLE' ? '回收' : action === 'SCRAP' ? '报废' : action,
      occurred_at: eventTime(row.created_at),
      created_by: row.created_by,
      reference_no: row.reference_no,
      employee_no: row.employee_no,
      employee_name: row.employee_name,
      department: row.department,
      remark: row.remark,
      status: row.status,
    });
  }
  for (const row of inventoryRows.results || []) {
    const action = String(row.action || '').toUpperCase();
    events.push({
      id: `pc-inventory-${row.id}`,
      kind: 'pc',
      asset_id: assetId,
      category: 'inventory',
      action,
      title: action === 'OK' ? '盘点正常' : '盘点异常',
      occurred_at: eventTime(row.created_at),
      issue_type: row.issue_type,
      remark: row.remark,
    });
  }
  return { asset, events: events.sort(compareEvents) };
}

export async function getMonitorAssetLifecycle(db: D1Database, scope: UserDataScope, assetId: number) {
  const asset = await db.prepare(`
    SELECT a.*, loc.name AS location_name, parent_loc.name AS parent_location_name
    FROM monitor_assets a
    LEFT JOIN pc_locations loc ON loc.id = a.location_id
    LEFT JOIN pc_locations parent_loc ON parent_loc.id = loc.parent_id
    WHERE a.id=?
  `).bind(assetId).first<any>();
  if (!asset) return { asset: null, events: [] as AssetLifecycleEvent[] };
  assertMonitorAssetDataScopeAccess(scope, asset.department, '显示器资产生命周期');
  const [txRows, inventoryRows] = await Promise.all([
    db.prepare(`
      SELECT
        t.*,
        fl.name AS from_location_name,
        tl.name AS to_location_name,
        fp.name AS from_parent_location_name,
        tp.name AS to_parent_location_name
      FROM monitor_tx t
      LEFT JOIN pc_locations fl ON fl.id = t.from_location_id
      LEFT JOIN pc_locations tl ON tl.id = t.to_location_id
      LEFT JOIN pc_locations fp ON fp.id = fl.parent_id
      LEFT JOIN pc_locations tp ON tp.id = tl.parent_id
      WHERE t.asset_id=?
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 200
    `).bind(assetId).all<any>(),
    db.prepare(`
      SELECT id, action, issue_type, remark, created_at
      FROM monitor_inventory_log
      WHERE asset_id=?
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    `).bind(assetId).all<any>(),
  ]);
  const events: AssetLifecycleEvent[] = [
    {
      id: `monitor-asset-${asset.id}`,
      kind: 'monitor',
      asset_id: assetId,
      category: 'asset',
      action: 'CURRENT',
      title: '当前状态',
      occurred_at: eventTime(asset.updated_at || asset.created_at),
      status: asset.status,
      employee_no: asset.employee_no,
      employee_name: asset.employee_name,
      department: asset.department,
      location_name: asset.location_name,
      remark: asset.archived ? asset.archived_reason : asset.remark,
    },
  ];
  if (asset.created_at) {
    events.push({
      id: `monitor-created-${asset.id}`,
      kind: 'monitor',
      asset_id: assetId,
      category: 'asset',
      action: 'CREATE',
      title: '资产建档',
      occurred_at: eventTime(asset.created_at),
      status: asset.status,
      location_name: asset.location_name,
      remark: asset.remark,
    });
  }
  if (Number(asset.archived || 0) === 1) {
    events.push({
      id: `monitor-archived-${asset.id}`,
      kind: 'monitor',
      asset_id: assetId,
      category: 'archive',
      action: 'ARCHIVE',
      title: '资产归档',
      occurred_at: eventTime(asset.archived_at || asset.updated_at),
      created_by: asset.archived_by,
      remark: [asset.archived_reason, asset.archived_note].filter(Boolean).join(' / '),
    });
  }
  for (const row of txRows.results || []) {
    const action = String(row.tx_type || '').toUpperCase();
    events.push({
      id: `monitor-tx-${action}-${row.id}`,
      kind: 'monitor',
      asset_id: assetId,
      category: 'movement',
      action,
      title: action === 'IN' ? '入库' : action === 'OUT' ? '领用出库' : action === 'RETURN' ? '归还' : action === 'TRANSFER' ? '调拨' : action,
      occurred_at: eventTime(row.created_at),
      created_by: row.created_by,
      reference_no: row.tx_no,
      employee_no: row.employee_no,
      employee_name: row.employee_name,
      department: row.department,
      from_location_name: [row.from_parent_location_name, row.from_location_name].filter(Boolean).join('/'),
      to_location_name: [row.to_parent_location_name, row.to_location_name].filter(Boolean).join('/'),
      remark: row.remark,
    });
  }
  for (const row of inventoryRows.results || []) {
    const action = String(row.action || '').toUpperCase();
    events.push({
      id: `monitor-inventory-${row.id}`,
      kind: 'monitor',
      asset_id: assetId,
      category: 'inventory',
      action,
      title: action === 'OK' ? '盘点正常' : '盘点异常',
      occurred_at: eventTime(row.created_at),
      issue_type: row.issue_type,
      remark: row.remark,
    });
  }
  return { asset, events: events.sort(compareEvents) };
}
