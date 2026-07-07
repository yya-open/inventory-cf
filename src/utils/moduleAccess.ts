import { hasCapability } from '../domain/capabilities';
import {
  MODULE_ROUTE_DEFS,
  PARTS_ROUTE_DEFS,
  PC_ROUTE_DEFS,
  SYSTEM_ROUTE_DEFS,
  type ModuleArea,
  type ModuleRouteDefinition,
  type PcSection,
} from '../router/moduleRouteManifest';
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

export type { ModuleArea, PcSection };
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

export function canAccessModuleArea(user: ScopeLikeUser, area: Exclude<ModuleArea, 'system'>) {
  const modes = allowedModes(user);
  if (area === 'parts') return modes.has('parts');
  return modes.has('pc') || modes.has('monitor');
}

export function canAccessPcSection(user: ScopeLikeUser, section: PcSection) {
  const modes = allowedModes(user);
  return modes.has(section);
}

function canAccessDefinition(user: ScopeLikeUser, item: ModuleRouteDefinition) {
  if (!user) return false;
  if (item.area === 'parts' && !canAccessModuleArea(user, 'parts')) return false;
  if (item.area === 'pc' && item.pcSection && !canAccessPcSection(user, item.pcSection)) return false;
  if (item.area === 'pc' && !item.pcSection && !canAccessModuleArea(user, 'pc')) return false;
  if (item.minRole && roleRank(user.role) < roleRank(item.minRole)) return false;
  if (item.permission && !hasPermission(user as any, item.permission)) return false;
  if (item.capability && !hasCapability(user as any, item.capability)) return false;
  return true;
}

export function canAccessSystemArea(user: ScopeLikeUser) {
  return SYSTEM_ROUTE_DEFS.some((item) => canAccessDefinition(user, item));
}

export function preferredPcRoute(user: ScopeLikeUser) {
  if (canAccessPcSection(user, 'pc')) return '/pc/assets';
  if (canAccessPcSection(user, 'monitor')) return '/pc/monitors';
  return '/pc/assets';
}

export function firstAccessibleSystemRoute(user: ScopeLikeUser) {
  return SYSTEM_ROUTE_DEFS.find((item) => canAccessDefinition(user, item))?.path || '/login';
}

export function firstAccessibleRoute(user: ScopeLikeUser) {
  if (canAccessModuleArea(user, 'parts')) return '/stock';
  if (canAccessModuleArea(user, 'pc')) return preferredPcRoute(user);
  if (canAccessSystemArea(user)) return firstAccessibleSystemRoute(user);
  return '/login';
}

export function firstAccessibleArea(user: ScopeLikeUser): Exclude<ModuleArea, 'system'> {
  return canAccessModuleArea(user, 'parts') ? 'parts' : 'pc';
}

function accessibleLabel(item: ModuleRouteDefinition) {
  if (item.area === 'system') return `系统 / ${item.label}`;
  if (item.area === 'parts') return `配件仓 / ${item.label === '批量出入库' ? '批量操作' : item.label}`;
  if (item.pcSection === 'monitor') return `显示器仓 / ${item.label.replace(/^显示器/, '')}`;
  return `电脑仓 / ${item.label.replace(/^电脑/, '')}`;
}

export function getAccessibleRouteItems(user: ScopeLikeUser): AccessibleRouteItem[] {
  const items = MODULE_ROUTE_DEFS
    .filter((item) => item.accessibleSummary)
    .map((item) => ({
      code: item.code,
      label: accessibleLabel(item),
      enabled: canAccessDefinition(user, item),
    }));
  return items.filter((item, index, arr) => item.enabled && arr.findIndex((row) => row.code === item.code) === index);
}

export function getAccessibleRouteLabels(user: ScopeLikeUser) {
  return getAccessibleRouteItems(user).map((item) => item.label);
}

const PARTS_ROUTE_PREFIXES = PARTS_ROUTE_DEFS.map((item) => item.path);
const PC_ONLY_ROUTES = new Set(PC_ROUTE_DEFS.filter((item) => item.pcSection === 'pc').map((item) => item.path));
const MONITOR_ONLY_ROUTES = new Set(PC_ROUTE_DEFS.filter((item) => item.pcSection === 'monitor').map((item) => item.path));

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
