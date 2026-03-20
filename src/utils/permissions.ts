export type PermissionCode =
  | 'system_settings_write'
  | 'audit_export'
  | 'asset_purge'
  | 'bulk_operation'
  | 'stocktake_apply'
  | 'ops_tools'
  | 'async_job_manage';

export const PERMISSION_LABEL: Record<PermissionCode, string> = {
  system_settings_write: '系统配置修改',
  audit_export: '审计导出',
  asset_purge: '彻底删除资产',
  bulk_operation: '批量操作',
  stocktake_apply: '应用盘点',
  ops_tools: '运维工具',
  async_job_manage: '异步任务中心',
};

export const ALL_PERMISSION_CODES = Object.keys(PERMISSION_LABEL) as PermissionCode[];

export function hasPermission(user: { role?: string | null; permissions?: Record<string, boolean> } | null | undefined, code: PermissionCode) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return !!user.permissions?.[code];
}
