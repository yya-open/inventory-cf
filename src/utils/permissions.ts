export type PermissionCode =
  | 'system_settings_write'
  | 'audit_export'
  | 'asset_purge'
  | 'bulk_operation'
  | 'stocktake_apply'
  | 'ops_tools'
  | 'async_job_manage'
  | 'qr_export'
  | 'qr_reset';

export type PermissionTemplateCode = 'admin_full' | 'admin_ops' | 'operator_plus' | 'auditor' | 'readonly';

export const PERMISSION_LABEL: Record<PermissionCode, string> = {
  system_settings_write: '系统配置修改',
  audit_export: '审计导出',
  asset_purge: '彻底删除资产',
  bulk_operation: '批量操作',
  stocktake_apply: '应用盘点',
  ops_tools: '运维工具',
  async_job_manage: '异步任务中心',
  qr_export: '二维码/标签导出',
  qr_reset: '二维码重置',
};

export const PERMISSION_TEMPLATE_LABEL: Record<PermissionTemplateCode, string> = {
  admin_full: '管理员-完全权限',
  admin_ops: '管理员-运维模板',
  operator_plus: '操作员-增强模板',
  auditor: '审计员模板',
  readonly: '只读模板',
};

export const PERMISSION_TEMPLATE_DEFAULTS: Record<PermissionTemplateCode, Record<PermissionCode, boolean>> = {
  admin_full: {
    system_settings_write: true,
    audit_export: true,
    asset_purge: true,
    bulk_operation: true,
    stocktake_apply: true,
    ops_tools: true,
    async_job_manage: true,
    qr_export: true,
    qr_reset: true,
  },
  admin_ops: {
    system_settings_write: false,
    audit_export: true,
    asset_purge: false,
    bulk_operation: true,
    stocktake_apply: true,
    ops_tools: true,
    async_job_manage: true,
    qr_export: true,
    qr_reset: true,
  },
  operator_plus: {
    system_settings_write: false,
    audit_export: false,
    asset_purge: false,
    bulk_operation: true,
    stocktake_apply: false,
    ops_tools: false,
    async_job_manage: false,
    qr_export: true,
    qr_reset: false,
  },
  auditor: {
    system_settings_write: false,
    audit_export: true,
    asset_purge: false,
    bulk_operation: false,
    stocktake_apply: false,
    ops_tools: false,
    async_job_manage: false,
    qr_export: false,
    qr_reset: false,
  },
  readonly: {
    system_settings_write: false,
    audit_export: false,
    asset_purge: false,
    bulk_operation: false,
    stocktake_apply: false,
    ops_tools: false,
    async_job_manage: false,
    qr_export: false,
    qr_reset: false,
  },
};

export const ALL_PERMISSION_CODES = Object.keys(PERMISSION_LABEL) as PermissionCode[];
export const ALL_PERMISSION_TEMPLATE_CODES = Object.keys(PERMISSION_TEMPLATE_LABEL) as PermissionTemplateCode[];

export function getDefaultPermissionTemplate(role?: string | null): PermissionTemplateCode {
  if (role === 'admin') return 'admin_full';
  if (role === 'operator') return 'operator_plus';
  return 'readonly';
}

export function normalizePermissionTemplateCode(role?: string | null, templateCode?: string | null): PermissionTemplateCode {
  return (templateCode && ALL_PERMISSION_TEMPLATE_CODES.includes(templateCode as PermissionTemplateCode)
    ? templateCode
    : getDefaultPermissionTemplate(role)) as PermissionTemplateCode;
}

export function buildTemplatePermissionMap(role?: string | null, templateCode?: string | null) {
  const code = normalizePermissionTemplateCode(role, templateCode);
  return { ...PERMISSION_TEMPLATE_DEFAULTS[code] };
}

export function hasPermission(user: { role?: string | null; permissions?: Record<string, boolean>; permission_template_code?: string | null } | null | undefined, code: PermissionCode) {
  if (!user) return false;
  if (user.role === 'admin' && (!user.permission_template_code || user.permission_template_code === 'admin_full')) return true;
  return !!user.permissions?.[code];
}
