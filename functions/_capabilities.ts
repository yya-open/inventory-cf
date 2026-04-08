import type { AuthUser } from './_auth';
import { requireAuth } from './_auth';
import { getUserPermissionMap, getUserTemplateCode, type PermissionCode } from './_permissions';

export type CapabilityCode =
  | 'inventory.view'
  | 'inventory.manage'
  | 'system.settings.manage'
  | 'system.jobs.manage'
  | 'system.tools.manage'
  | 'qr.export'
  | 'qr.reset';

const CAPABILITY_RULES: Record<CapabilityCode, { minRole: 'viewer' | 'operator' | 'admin'; permission?: PermissionCode }> = {
  'inventory.view': { minRole: 'viewer' },
  'inventory.manage': { minRole: 'operator' },
  'system.settings.manage': { minRole: 'admin', permission: 'system_settings_write' },
  'system.jobs.manage': { minRole: 'viewer', permission: 'async_job_manage' },
  'system.tools.manage': { minRole: 'viewer', permission: 'ops_tools' },
  'qr.export': { minRole: 'viewer', permission: 'qr_export' },
  'qr.reset': { minRole: 'viewer', permission: 'qr_reset' },
};

export async function requireCapability(env: { DB: D1Database; JWT_SECRET?: string }, request: Request, capability: CapabilityCode) {
  const rule = CAPABILITY_RULES[capability];
  const user = await requireAuth(env as any, request, rule.minRole);
  if (!rule.permission) return user;
  const templateCode = await getUserTemplateCode(env.DB, user.id, user.role).catch(() => null);
  const permissions = await getUserPermissionMap(env.DB, user.id, user.role, templateCode || undefined);
  if (!permissions[rule.permission]) throw Object.assign(new Error('权限不足'), { status: 403 });
  return Object.assign(user, { permissions, permission_template_code: templateCode }) as AuthUser & { permissions: Record<string, boolean>; permission_template_code?: string | null };
}
