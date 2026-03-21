import { resolvePartsWarehouseId, scopeAllowsAssetWarehouse, type UserDataScope } from './data-scope';

function firstNumber(row: any) {
  return Number(row?.c || 0);
}

function departmentScopeValue(scope?: UserDataScope | null) {
  return scope?.data_scope_type === 'department' || scope?.data_scope_type === 'department_warehouse'
    ? String(scope?.data_scope_value || '').trim()
    : '';
}

export function dataScopeLabelFromServer(scope?: UserDataScope | null) {
  if (!scope || scope.data_scope_type === 'all') return '全部数据';
  if (scope.data_scope_type === 'department') return `部门：${scope.data_scope_value || '-'}`;
  if (scope.data_scope_type === 'warehouse') return `仓库：${scope.data_scope_value || '-'}`;
  return `部门：${scope?.data_scope_value || '-'} / 仓库：${scope?.data_scope_value2 || '-'}`;
}

function allowedReportModes(scope?: UserDataScope | null) {
  if (!scope || scope.data_scope_type === 'all') return ['parts', 'pc', 'monitor'];
  if (scope.data_scope_type === 'department') return ['pc', 'monitor'];
  if (scope.data_scope_type === 'warehouse') {
    if (scope.data_scope_value === '配件仓') return ['parts'];
    if (scope.data_scope_value === '电脑仓') return ['pc'];
    if (scope.data_scope_value === '显示器仓') return ['monitor'];
    return [];
  }
  if (scope.data_scope_type === 'department_warehouse') {
    if (scope.data_scope_value2 === '配件仓') return ['parts'];
    if (scope.data_scope_value2 === '电脑仓') return ['pc'];
    if (scope.data_scope_value2 === '显示器仓') return ['monitor'];
  }
  return [];
}

export async function buildScopePreview(db: D1Database, scope: UserDataScope) {
  const department = departmentScopeValue(scope);
  const modes = allowedReportModes(scope);
  const routes: Array<{ code: string; label: string; enabled: boolean; reason?: string }> = [
    { code: 'parts_ledger', label: '配件仓台账', enabled: scopeAllowsAssetWarehouse(scope, '配件仓') && !department, reason: department ? '配件仓看板/台账暂不支持按部门隔离' : undefined },
    { code: 'pc_ledger', label: '电脑台账', enabled: scopeAllowsAssetWarehouse(scope, '电脑仓') },
    { code: 'monitor_ledger', label: '显示器台账', enabled: scopeAllowsAssetWarehouse(scope, '显示器仓') },
    { code: 'dashboard', label: '报表看板', enabled: modes.length > 0 },
  ];
  const pcWhere = department ? `WHERE TRIM(COALESCE(s.current_department,''))=?` : '';
  const pcBinds = department ? [department] : [];
  const monitorWhere = department ? `WHERE TRIM(COALESCE(a.department,''))=?` : '';
  const monitorBinds = department ? [department] : [];

  const pcCountPromise = scopeAllowsAssetWarehouse(scope, '电脑仓')
    ? db.prepare(`SELECT COUNT(*) AS c FROM pc_assets a LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id ${pcWhere}`).bind(...pcBinds).first<any>()
    : Promise.resolve({ c: 0 });
  const monitorCountPromise = scopeAllowsAssetWarehouse(scope, '显示器仓')
    ? db.prepare(`SELECT COUNT(*) AS c FROM monitor_assets a ${monitorWhere}`).bind(...monitorBinds).first<any>()
    : Promise.resolve({ c: 0 });
  const warehouseId = (!department && scopeAllowsAssetWarehouse(scope, '配件仓')) ? await resolvePartsWarehouseId(db, scope, 1) : -1;
  const partsCountPromise = warehouseId > 0
    ? db.prepare(`SELECT COUNT(*) AS c FROM items`).first<any>()
    : Promise.resolve({ c: 0 });
  const [pcCount, monitorCount, partsCount] = await Promise.all([pcCountPromise, monitorCountPromise, partsCountPromise]);
  const routeMeta = {
    report_modes: modes.map((mode) => ({ value: mode, label: mode === 'parts' ? '配件仓' : mode === 'pc' ? '电脑仓' : '显示器仓' })),
    accessible_warehouses: ['配件仓', '电脑仓', '显示器仓'].filter((label) => scopeAllowsAssetWarehouse(scope, label as any)),
  };
  return {
    scope,
    scope_label: dataScopeLabelFromServer(scope),
    department: department || null,
    route_meta: routeMeta,
    routes,
    counts: {
      pc_assets: firstNumber(pcCount),
      monitor_assets: firstNumber(monitorCount),
      parts_items: firstNumber(partsCount),
    },
    tips: [
      department ? `当前预览已收口到部门：${department}` : '当前预览为跨部门范围',
      modes.length ? `可进入看板：${routeMeta.report_modes.map((item) => item.label).join('、')}` : '当前范围没有可用看板',
    ],
  };
}
