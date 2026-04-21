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
