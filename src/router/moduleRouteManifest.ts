import type { CapabilityCode } from '../domain/capabilities';
import type { PermissionCode } from '../utils/permissions';
import type { Role } from '../utils/roles';

export type ModuleArea = 'parts' | 'pc' | 'system';
export type PcSection = 'pc' | 'monitor';
export type RouteIconName =
  | 'box'
  | 'document'
  | 'warning'
  | 'plus'
  | 'minus'
  | 'operation'
  | 'management'
  | 'upload'
  | 'checked'
  | 'setting'
  | 'data-analysis'
  | 'histogram'
  | 'files'
  | 'refresh'
  | 'monitor'
  | 'cpu'
  | 'tools'
  | 'user'
  | 'reading'
  | 'folder-checked'
  | 'trend-charts';

export type ModuleRouteDefinition = {
  code: string;
  path: string;
  label: string;
  title?: string;
  area: ModuleArea;
  icon: RouteIconName;
  minRole?: Role;
  permission?: PermissionCode;
  capability?: CapabilityCode;
  pcSection?: PcSection;
  menu?: boolean;
  accessibleSummary?: boolean;
};

export const SYSTEM_ROUTE_DEFS: ModuleRouteDefinition[] = [
  { code: 'system_home', path: '/system/home', label: '系统首页', title: '系统', area: 'system', icon: 'setting', minRole: 'admin', menu: true, accessibleSummary: true },
  { code: 'system_dashboard', path: '/system/dashboard', label: '报表与看板', area: 'system', icon: 'data-analysis', minRole: 'admin', menu: true, accessibleSummary: true },
  { code: 'system_reports', path: '/system/reports', label: '数据报表中心', area: 'system', icon: 'histogram', minRole: 'admin', menu: true, accessibleSummary: true },
  { code: 'system_tasks', path: '/system/tasks', label: '批量任务中心', area: 'system', icon: 'files', minRole: 'viewer', capability: 'system.jobs.manage', menu: true, accessibleSummary: true },
  { code: 'system_backup', path: '/system/backup', label: '备份/恢复', area: 'system', icon: 'refresh', minRole: 'admin', menu: true, accessibleSummary: true },
  { code: 'system_audit', path: '/system/audit', label: '审计日志', area: 'system', icon: 'document', minRole: 'viewer', permission: 'audit_export', menu: true, accessibleSummary: true },
  { code: 'system_users', path: '/system/users', label: '用户管理', area: 'system', icon: 'user', minRole: 'admin', menu: true, accessibleSummary: true },
  { code: 'system_settings', path: '/system/settings', label: '系统配置', area: 'system', icon: 'tools', minRole: 'viewer', capability: 'system.settings.manage', menu: true, accessibleSummary: true },
  { code: 'system_sku_governance', path: '/system/sku-governance', label: 'SKU 治理', area: 'system', icon: 'management', minRole: 'admin', menu: true, accessibleSummary: true },
  { code: 'system_tools', path: '/system/tools', label: '运维工具', area: 'system', icon: 'operation', minRole: 'viewer', capability: 'system.tools.manage', menu: true, accessibleSummary: true },
  { code: 'system_release_check', path: '/system/release-check', label: '发布前检查', area: 'system', icon: 'folder-checked', minRole: 'admin', menu: true, accessibleSummary: true },
  { code: 'system_performance', path: '/system/performance', label: '性能面板', area: 'system', icon: 'trend-charts', minRole: 'viewer', capability: 'system.tools.manage', menu: true, accessibleSummary: true },
  { code: 'system_docs', path: '/system/docs', label: '系统交付文档', area: 'system', icon: 'reading', minRole: 'admin', menu: true, accessibleSummary: true },
  { code: 'system_data_quality', path: '/system/data-quality', label: '数据质量中心', area: 'system', icon: 'checked', minRole: 'viewer', capability: 'system.tools.manage', menu: true, accessibleSummary: true },
];

export const PARTS_ROUTE_DEFS: ModuleRouteDefinition[] = [
  { code: 'parts_stock', path: '/stock', label: '库存查询', area: 'parts', icon: 'box', minRole: 'viewer', menu: true, accessibleSummary: true },
  { code: 'parts_tx', path: '/tx', label: '出入库明细', area: 'parts', icon: 'document', minRole: 'viewer', menu: true, accessibleSummary: true },
  { code: 'parts_warnings', path: '/warnings', label: '预警中心', area: 'parts', icon: 'warning', minRole: 'viewer', menu: true, accessibleSummary: true },
  { code: 'parts_in', path: '/in', label: '入库', area: 'parts', icon: 'plus', minRole: 'operator', menu: true, accessibleSummary: true },
  { code: 'parts_out', path: '/out', label: '出库', area: 'parts', icon: 'minus', minRole: 'operator', menu: true, accessibleSummary: true },
  { code: 'parts_batch', path: '/batch', label: '批量出入库', area: 'parts', icon: 'operation', minRole: 'operator', menu: true, accessibleSummary: true },
  { code: 'parts_items', path: '/items', label: '配件管理', area: 'parts', icon: 'management', minRole: 'admin', menu: true },
  { code: 'parts_import', path: '/import/items', label: 'Excel 导入配件', area: 'parts', icon: 'upload', minRole: 'admin', menu: true },
  { code: 'parts_stocktake', path: '/stocktake', label: '库存盘点', area: 'parts', icon: 'checked', minRole: 'admin', menu: true },
];

export const PC_ROUTE_DEFS: ModuleRouteDefinition[] = [
  { code: 'pc_assets', path: '/pc/assets', label: '电脑台账', area: 'pc', icon: 'cpu', minRole: 'viewer', pcSection: 'pc', menu: true, accessibleSummary: true },
  { code: 'asset_ownership', path: '/pc/asset-ownership', label: '人员/部门资产视图', area: 'pc', icon: 'user', minRole: 'viewer', menu: true, accessibleSummary: true },
  { code: 'pc_age_warnings', path: '/pc/age-warnings', label: '报废预警', area: 'pc', icon: 'warning', minRole: 'viewer', pcSection: 'pc', menu: true, accessibleSummary: true },
  { code: 'pc_tx', path: '/pc/tx', label: '电脑出入库明细', area: 'pc', icon: 'document', minRole: 'viewer', pcSection: 'pc', menu: true, accessibleSummary: true },
  { code: 'pc_inventory_logs', path: '/pc/inventory-logs', label: '盘点记录', area: 'pc', icon: 'checked', minRole: 'viewer', pcSection: 'pc', menu: true },
  { code: 'monitor_assets', path: '/pc/monitors', label: '显示器台账', area: 'pc', icon: 'monitor', minRole: 'viewer', pcSection: 'monitor', menu: true, accessibleSummary: true },
  { code: 'monitor_tx', path: '/pc/monitor-tx', label: '显示器出入库明细', area: 'pc', icon: 'document', minRole: 'viewer', pcSection: 'monitor', menu: true, accessibleSummary: true },
  { code: 'monitor_inventory_logs', path: '/pc/monitor-inventory-logs', label: '显示器盘点记录', area: 'pc', icon: 'checked', minRole: 'viewer', pcSection: 'monitor', menu: true, accessibleSummary: true },
  { code: 'pc_in', path: '/pc/in', label: '电脑入库', area: 'pc', icon: 'plus', minRole: 'operator', pcSection: 'pc', menu: true, accessibleSummary: true },
  { code: 'pc_out', path: '/pc/out', label: '电脑出库', area: 'pc', icon: 'minus', minRole: 'operator', pcSection: 'pc', menu: true, accessibleSummary: true },
  { code: 'pc_recycle', path: '/pc/recycle', label: '电脑回收/归还', area: 'pc', icon: 'refresh', minRole: 'operator', pcSection: 'pc', menu: true, accessibleSummary: true },
];

export const MODULE_ROUTE_DEFS = [
  ...PARTS_ROUTE_DEFS,
  ...PC_ROUTE_DEFS,
  ...SYSTEM_ROUTE_DEFS,
];

export const ROUTE_DEFS_BY_PATH = new Map(MODULE_ROUTE_DEFS.map((item) => [item.path, item]));

export function getRouteTitle(path: string) {
  const def = ROUTE_DEFS_BY_PATH.get(path);
  return def?.title || def?.label || '';
}

export function getRouteMeta(path: string) {
  const def = ROUTE_DEFS_BY_PATH.get(path);
  if (!def) return {};
  return {
    role: def.minRole,
    title: def.title || def.label,
    permission: def.permission,
    capability: def.capability,
  };
}
