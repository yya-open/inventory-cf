import { resolvePartsWarehouseId, scopeAllowsAssetWarehouse, type UserDataScope } from './data-scope';

type PreviewRole = 'admin' | 'operator' | 'viewer';

function firstNumber(row: any) {
  return Number(row?.c || 0);
}

function departmentScopeValue(scope?: UserDataScope | null) {
  return scope?.data_scope_type === 'department' || scope?.data_scope_type === 'department_warehouse'
    ? String(scope?.data_scope_value || '').trim()
    : '';
}

function canRole(role: PreviewRole, min: PreviewRole) {
  const rank: Record<PreviewRole, number> = { viewer: 1, operator: 2, admin: 3 };
  return rank[role] >= rank[min];
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

function buildRouteChecks(scope: UserDataScope, role: PreviewRole) {
  const department = departmentScopeValue(scope);
  const partsEnabled = scopeAllowsAssetWarehouse(scope, '配件仓') && !department;
  const pcEnabled = scopeAllowsAssetWarehouse(scope, '电脑仓');
  const monitorEnabled = scopeAllowsAssetWarehouse(scope, '显示器仓');
  const adminEnabled = canRole(role, 'admin');
  const operatorEnabled = canRole(role, 'operator');
  const checks = [
    { path: '/stock', label: '配件仓 / 库存查询', enabled: partsEnabled, reason: partsEnabled ? '命中配件仓可见范围' : (department ? '配件仓暂不支持按部门隔离' : '当前范围未授权配件仓') },
    { path: '/tx', label: '配件仓 / 出入库明细', enabled: partsEnabled, reason: partsEnabled ? '命中配件仓可见范围' : (department ? '配件仓暂不支持按部门隔离' : '当前范围未授权配件仓') },
    { path: '/warnings', label: '配件仓 / 预警中心', enabled: partsEnabled, reason: partsEnabled ? '命中配件仓可见范围' : (department ? '配件仓暂不支持按部门隔离' : '当前范围未授权配件仓') },
    { path: '/in', label: '配件仓 / 入库', enabled: partsEnabled && operatorEnabled, reason: partsEnabled ? (operatorEnabled ? '命中配件仓范围，且角色具备操作权限' : '当前角色仅可查看，不能执行入库') : '当前范围未授权配件仓' },
    { path: '/out', label: '配件仓 / 出库', enabled: partsEnabled && operatorEnabled, reason: partsEnabled ? (operatorEnabled ? '命中配件仓范围，且角色具备操作权限' : '当前角色仅可查看，不能执行出库') : '当前范围未授权配件仓' },
    { path: '/pc/assets', label: '电脑仓 / 台账', enabled: pcEnabled, reason: pcEnabled ? '命中电脑仓可见范围' : '当前范围未授权电脑仓' },
    { path: '/pc/tx', label: '电脑仓 / 出入库明细', enabled: pcEnabled, reason: pcEnabled ? '命中电脑仓可见范围' : '当前范围未授权电脑仓' },
    { path: '/pc/in', label: '电脑仓 / 入库', enabled: pcEnabled && operatorEnabled, reason: pcEnabled ? (operatorEnabled ? '命中电脑仓范围，且角色具备操作权限' : '当前角色仅可查看，不能执行电脑入库') : '当前范围未授权电脑仓' },
    { path: '/pc/monitors', label: '显示器仓 / 台账', enabled: monitorEnabled, reason: monitorEnabled ? '命中显示器仓可见范围' : '当前范围未授权显示器仓' },
    { path: '/pc/monitor-tx', label: '显示器仓 / 出入库明细', enabled: monitorEnabled, reason: monitorEnabled ? '命中显示器仓可见范围' : '当前范围未授权显示器仓' },
    { path: '/system/dashboard', label: '系统 / 报表看板', enabled: adminEnabled && allowedReportModes(scope).length > 0, reason: adminEnabled ? (allowedReportModes(scope).length ? '管理员可访问系统看板，仓域会按可见范围收口' : '当前范围没有可用看板') : '仅管理员可访问系统模块' },
    { path: '/system/users', label: '系统 / 用户管理', enabled: adminEnabled, reason: adminEnabled ? '管理员可访问系统管理页面' : '仅管理员可访问系统模块' },
    { path: '/system/performance', label: '系统 / 性能面板', enabled: adminEnabled, reason: adminEnabled ? '管理员可访问性能面板' : '仅管理员可访问系统模块' },
  ];
  const menuGroups = [
    { code: 'parts', label: '配件仓菜单', enabled: partsEnabled, visible_count: checks.filter((item) => !item.path.startsWith('/pc') && !item.path.startsWith('/system') && item.enabled).length },
    { code: 'pc', label: '电脑/显示器仓菜单', enabled: pcEnabled || monitorEnabled, visible_count: checks.filter((item) => item.path.startsWith('/pc') && item.enabled).length },
    { code: 'system', label: '系统菜单', enabled: adminEnabled, visible_count: checks.filter((item) => item.path.startsWith('/system') && item.enabled).length },
  ];
  return { checks, menuGroups };
}

export async function buildScopePreview(db: D1Database, scope: UserDataScope, role: PreviewRole = 'viewer') {
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
  const partsCountPromise = warehouseId > 0 ? db.prepare(`SELECT COUNT(*) AS c FROM items`).first<any>() : Promise.resolve({ c: 0 });
  const [pcCount, monitorCount, partsCount] = await Promise.all([pcCountPromise, monitorCountPromise, partsCountPromise]);
  const routeMeta = {
    report_modes: modes.map((mode) => ({ value: mode, label: mode === 'parts' ? '配件仓' : mode === 'pc' ? '电脑仓' : '显示器仓' })),
    accessible_warehouses: ['配件仓', '电脑仓', '显示器仓'].filter((label) => scopeAllowsAssetWarehouse(scope, label as any)),
  };
  const policy = buildRouteChecks(scope, role);
  return {
    scope,
    role,
    scope_label: dataScopeLabelFromServer(scope),
    department: department || null,
    route_meta: routeMeta,
    routes,
    route_checks: policy.checks,
    menu_groups: policy.menuGroups,
    counts: {
      pc_assets: firstNumber(pcCount),
      monitor_assets: firstNumber(monitorCount),
      parts_items: firstNumber(partsCount),
    },
    tips: [
      department ? `当前预览已收口到部门：${department}` : '当前预览为跨部门范围',
      modes.length ? `可进入看板：${routeMeta.report_modes.map((item) => item.label).join('、')}` : '当前范围没有可用看板',
      canRole(role, 'admin') ? '当前角色具备系统管理入口' : '当前角色不具备系统管理入口',
    ],
  };
}
