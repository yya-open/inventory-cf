import { hasRole, type Role } from '../utils/roles';
import { hasPermission, type PermissionCode } from '../utils/permissions';

export type CapabilityCode =
  | 'inventory.manage'
  | 'inventory.view'
  | 'inventory.history.view'
  | 'inventory.snapshot.export'
  | 'pc.assets.manage'
  | 'monitor.assets.manage'
  | 'system.settings.manage'
  | 'system.jobs.manage'
  | 'system.tools.manage'
  | 'qr.export'
  | 'qr.reset';

export type CapabilitySubject = {
  role?: string | null;
  permissions?: Record<string, boolean>;
  permission_template_code?: string | null;
};

const CAPABILITY_RULES: Record<CapabilityCode, { role?: Role; permission?: PermissionCode }> = {
  'inventory.manage': { role: 'operator' },
  'inventory.view': { role: 'viewer' },
  'inventory.history.view': { role: 'viewer' },
  'inventory.snapshot.export': { role: 'viewer' },
  'pc.assets.manage': { role: 'operator' },
  'monitor.assets.manage': { role: 'operator' },
  'system.settings.manage': { permission: 'system_settings_write' },
  'system.jobs.manage': { permission: 'async_job_manage' },
  'system.tools.manage': { permission: 'ops_tools' },
  'qr.export': { permission: 'qr_export' },
  'qr.reset': { permission: 'qr_reset' },
};

export function hasCapability(user: CapabilitySubject | null | undefined, capability: CapabilityCode) {
  const rule = CAPABILITY_RULES[capability];
  if (!user || !rule) return false;
  if (rule.role && !hasRole((user.role as Role | undefined) || 'viewer', rule.role)) return false;
  if (rule.permission && !hasPermission(user, rule.permission)) return false;
  return true;
}

export function requireCapability(user: CapabilitySubject | null | undefined, capability: CapabilityCode, message = '权限不足') {
  if (!hasCapability(user, capability)) throw new Error(message);
}
