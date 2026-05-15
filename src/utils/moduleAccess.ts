import { hasPermission } from './permissions';
import { scopeModeOptions } from './dataScope';

export type ScopeLikeUser = {
  role?: string | null;
  permissions?: Record<string, boolean>;
  permission_template_code?: string | null;
  data_scope_type?: 'all' | 'department' | 'warehouse' | 'department_warehouse' | string | null;
  data_scope_value?: string | null;
  data_scope_value2?: string | null;
} | null | undefined;

export type ModuleArea = 'parts' | 'pc';
export type PcSection = 'pc' | 'monitor';
export type AccessibleRouteItem = { code: string; label: string; enabled: boolean };

function roleRank(role?: string | null) {
  const normalized = String(role || '');
  if (normalized === 'admin') return 3;
  if (normalized === 'operator') return 2;
  return 1;
}

function allowedModes(user: ScopeLikeUser) {
  return new Set(scopeModeOptions(user?.data_scope_type, user?.data_scope_value, user?.data_scope_value2));
}

export function canAccessModuleArea(user: ScopeLikeUser, area: ModuleArea) {
  const modes = allowedModes(user);
  if (area === 'parts') return modes.has('parts');
  return modes.has('pc') || modes.has('monitor');
}

export function canAccessPcSection(user: ScopeLikeUser, section: PcSection) {
  const modes = allowedModes(user);
  return modes.has(section);
}

export function canAccessSystemArea(user: ScopeLikeUser) {
  if (!user) return false;
  if (String(user.role || '') === 'admin') return true;
  return hasPermission(user as any, 'async_job_manage')
    || hasPermission(user as any, 'audit_export')
    || hasPermission(user as any, 'system_settings_write')
    || hasPermission(user as any, 'ops_tools');
}

export function preferredPcRoute(user: ScopeLikeUser) {
  if (canAccessPcSection(user, 'pc')) return '/pc/assets';
  if (canAccessPcSection(user, 'monitor')) return '/pc/monitors';
  return '/pc/assets';
}

export function firstAccessibleSystemRoute(user: ScopeLikeUser) {
  if (String(user?.role || '') === 'admin') return '/system/home';
  if (hasPermission(user as any, 'async_job_manage')) return '/system/tasks';
  if (hasPermission(user as any, 'audit_export')) return '/system/audit';
  if (hasPermission(user as any, 'system_settings_write')) return '/system/settings';
  if (hasPermission(user as any, 'ops_tools')) return '/system/tools';
  return '/login';
}

export function firstAccessibleRoute(user: ScopeLikeUser) {
  if (canAccessModuleArea(user, 'parts')) return '/stock';
  if (canAccessModuleArea(user, 'pc')) return preferredPcRoute(user);
  if (canAccessSystemArea(user)) return firstAccessibleSystemRoute(user);
  return '/login';
}

export function firstAccessibleArea(user: ScopeLikeUser): ModuleArea {
  return canAccessModuleArea(user, 'parts') ? 'parts' : 'pc';
}

export function getAccessibleRouteItems(user: ScopeLikeUser): AccessibleRouteItem[] {
  const items: AccessibleRouteItem[] = [];
  const parts = canAccessModuleArea(user, 'parts');
  const pc = canAccessPcSection(user, 'pc');
  const monitor = canAccessPcSection(user, 'monitor');
  const system = canAccessSystemArea(user);
  const admin = String(user?.role || '') === 'admin';
  const operator = roleRank(user?.role) >= 2;

  if (parts) {
    items.push(
      { code: 'parts_stock', label: '配件仓 / 库存查询', enabled: true },
      { code: 'parts_tx', label: '配件仓 / 出入库明细', enabled: true },
      { code: 'parts_warnings', label: '配件仓 / 预警中心', enabled: true },
      { code: 'parts_in', label: '配件仓 / 入库', enabled: operator },
      { code: 'parts_out', label: '配件仓 / 出库', enabled: operator },
      { code: 'parts_batch', label: '配件仓 / 批量操作', enabled: operator },
    );
  }

  if (pc) {
    items.push(
      { code: 'pc_assets', label: '电脑仓 / 台账', enabled: true },
      { code: 'pc_tx', label: '电脑仓 / 出入库明细', enabled: true },
      { code: 'pc_in', label: '电脑仓 / 入库', enabled: operator },
      { code: 'pc_out', label: '电脑仓 / 出库', enabled: operator },
      { code: 'pc_recycle', label: '电脑仓 / 回收/归还', enabled: operator },
      { code: 'pc_age_warnings', label: '电脑仓 / 报废预警', enabled: true },
    );
  }

  if (monitor) {
    items.push(
      { code: 'monitor_assets', label: '显示器仓 / 台账', enabled: true },
      { code: 'monitor_tx', label: '显示器仓 / 出入库明细', enabled: true },
      { code: 'monitor_inventory_logs', label: '显示器仓 / 盘点记录', enabled: true },
    );
  }

  if (system) {
    if (admin) {
      items.push(
        { code: 'system_home', label: '系统 / 首页', enabled: true },
        { code: 'system_dashboard', label: '系统 / 报表看板', enabled: true },
        { code: 'system_reports', label: '系统 / 数据报表中心', enabled: true },
        { code: 'system_tasks', label: '系统 / 批量任务中心', enabled: true },
        { code: 'system_backup', label: '系统 / 备份恢复', enabled: true },
        { code: 'system_audit', label: '系统 / 审计日志', enabled: true },
        { code: 'system_users', label: '系统 / 用户管理', enabled: true },
        { code: 'system_settings', label: '系统 / 系统配置', enabled: true },
        { code: 'system_tools', label: '系统 / 运维工具', enabled: true },
        { code: 'system_release_check', label: '系统 / 发布前检查', enabled: true },
        { code: 'system_performance', label: '系统 / 性能面板', enabled: true },
        { code: 'system_docs', label: '系统 / 系统交付文档', enabled: true },
      );
    } else {
      items.push(
        { code: 'system_tasks', label: '系统 / 批量任务中心', enabled: hasPermission(user as any, 'async_job_manage') },
        { code: 'system_audit', label: '系统 / 审计日志', enabled: hasPermission(user as any, 'audit_export') },
        { code: 'system_settings', label: '系统 / 系统配置', enabled: hasPermission(user as any, 'system_settings_write') },
        { code: 'system_tools', label: '系统 / 运维工具', enabled: hasPermission(user as any, 'ops_tools') },
        { code: 'system_performance', label: '系统 / 性能面板', enabled: hasPermission(user as any, 'ops_tools') },
      );
    }
  }

  return items.filter((item, index, arr) => item.enabled && arr.findIndex((row) => row.code === item.code) === index);
}

export function getAccessibleRouteLabels(user: ScopeLikeUser) {
  return getAccessibleRouteItems(user).map((item) => item.label);
}

const PARTS_ROUTE_PREFIXES = ['/stock', '/tx', '/warnings', '/in', '/out', '/batch', '/stocktake', '/items', '/import/items'];
const PC_ONLY_ROUTES = new Set(['/pc/assets', '/pc/age-warnings', '/pc/tx', '/pc/inventory-logs', '/pc/in', '/pc/out', '/pc/recycle']);
const MONITOR_ONLY_ROUTES = new Set(['/pc/monitors', '/pc/monitor-tx', '/pc/monitor-inventory-logs']);

export function isPartsModuleRoute(path: string) {
  return PARTS_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}

export function isPcModuleRoute(path: string) {
  return path === '/pc' || path.startsWith('/pc/');
}

export function isPcOnlyRoute(path: string) {
  return PC_ONLY_ROUTES.has(path);
}

export function isMonitorOnlyRoute(path: string) {
  return MONITOR_ONLY_ROUTES.has(path);
}
