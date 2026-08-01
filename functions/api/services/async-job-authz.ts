import type { PermissionCode } from '../../_permissions';
import type { AsyncJobType } from './async-jobs';

export type AsyncJobAuthEntry = { permission: PermissionCode; minRole: 'viewer' | 'operator' | 'admin' };

/**
 * 异步任务类型 → 创建该任务所需的权限与最低角色。
 *
 * 背景：POST /api/jobs 过去按请求体里的 job_type 自行挑选要校验的权限（QR 导出用
 * qr_export，其余一律 async_job_manage + viewer），且 job_type 没有任何运行时白名单
 * （AsyncJobType 只在编译期存在），直接绑进 INSERT。于是任何持有 async_job_manage 的
 * viewer 都能创建 BACKUP_EXPORT（整库导出，含 users.password_hash）或
 * AUDIT_ARCHIVE_EXPORT（可带 delete_after_export 删审计），而它们的同步孪生接口
 * （admin/backup.ts、admin/audit/retention.ts、audit/delete.ts）都是 requireAuth(..., 'admin')。
 *
 * 每一项的取值都以「同步孪生接口的守卫」为准，异步通道不得比同步通道宽松。
 * 类型写成 Record<AsyncJobType, …>（而非 Partial）是刻意的：新增任务类型时编译器会强制
 * 在此登记权限，漏登记直接编译失败，不会静默沿用宽松默认值。
 */
export const JOB_TYPE_AUTH: Record<AsyncJobType, AsyncJobAuthEntry> = {
  // 整库导出（含 users.password_hash），对齐 admin/backup.ts 的 requireAuth(...,'admin')。
  BACKUP_EXPORT: { permission: 'async_job_manage', minRole: 'admin' },
  // 审计归档导出可携带 delete_after_export 删除审计行，对齐 admin/audit/retention.ts、audit/delete.ts。
  AUDIT_ARCHIVE_EXPORT: { permission: 'audit_export', minRole: 'admin' },
  // 只读审计导出，与同步审计导出一致：审计员（viewer + audit_export）即可。
  AUDIT_EXPORT: { permission: 'audit_export', minRole: 'viewer' },
  PC_QR_KEY_INIT: { permission: 'qr_reset', minRole: 'admin' },
  MONITOR_QR_KEY_INIT: { permission: 'qr_reset', minRole: 'admin' },
  PC_QR_CARDS_EXPORT: { permission: 'qr_export', minRole: 'viewer' },
  PC_QR_SHEET_EXPORT: { permission: 'qr_export', minRole: 'viewer' },
  MONITOR_QR_CARDS_EXPORT: { permission: 'qr_export', minRole: 'viewer' },
  MONITOR_QR_SHEET_EXPORT: { permission: 'qr_export', minRole: 'viewer' },
  PC_AGE_WARNING_EXPORT: { permission: 'async_job_manage', minRole: 'viewer' },
  DASHBOARD_PRECOMPUTE: { permission: 'async_job_manage', minRole: 'viewer' },
  OPS_SCAN_REFRESH: { permission: 'ops_tools', minRole: 'viewer' },
  ASSET_INVENTORY_BATCH_SNAPSHOT_EXPORT: { permission: 'async_job_manage', minRole: 'viewer' },
};

/**
 * 运行时白名单查询：不在表内的 job_type 一律返回 null，由调用方在触达数据库前拒绝。
 * 用 hasOwnProperty 而非 in / 下标真值判断，避免 `__proto__`、`constructor` 之类的
 * 原型链键被当成已登记类型。
 */
export function resolveAsyncJobAuth(jobType: string): AsyncJobAuthEntry | null {
  const key = String(jobType || '').trim();
  if (!Object.prototype.hasOwnProperty.call(JOB_TYPE_AUTH, key)) return null;
  return JOB_TYPE_AUTH[key as AsyncJobType];
}
