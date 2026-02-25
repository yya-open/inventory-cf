import type { PermissionKey } from "./permissions";

export type PermissionDocItem = {
  key: PermissionKey;
  name: string;
  module: "配件仓" | "电脑仓" | "系统";
  danger?: boolean;
  auditAction?: string;
  auditEntity?: string;
};

export const PERMISSION_DOC_ITEMS: PermissionDocItem[] = [
  { key: "tx.clear", name: "清空配件出入库明细", module: "配件仓", danger: true, auditAction: "TX_CLEAR", auditEntity: "stock_tx" },
  { key: "item.delete", name: "删除配件", module: "配件仓", danger: true, auditAction: "ITEM_DELETE", auditEntity: "items" },
  { key: "stocktake.delete", name: "删除盘点单", module: "配件仓", danger: true, auditAction: "STOCKTAKE_DELETE", auditEntity: "stocktake" },
  { key: "stocktake.apply", name: "应用盘点", module: "配件仓", danger: true, auditAction: "STOCKTAKE_APPLY", auditEntity: "stocktake" },
  { key: "stocktake.rollback", name: "撤销盘点", module: "配件仓", danger: true, auditAction: "STOCKTAKE_ROLLBACK", auditEntity: "stocktake" },
  { key: "pcAsset.update", name: "修改电脑台账", module: "电脑仓", auditAction: "pc_asset_update", auditEntity: "pc_assets" },
  { key: "pcAsset.delete", name: "删除电脑台账", module: "电脑仓", danger: true, auditAction: "pc_asset_delete", auditEntity: "pc_assets" },
  { key: "pcTx.delete", name: "删除电脑出入库明细", module: "电脑仓", danger: true, auditAction: "PC_TX_DELETE", auditEntity: "pc_tx" },
  { key: "pcTx.clear", name: "清空电脑出入库明细", module: "电脑仓", danger: true, auditAction: "PC_TX_CLEAR", auditEntity: "pc_tx" },
  { key: "audit.delete", name: "删除审计日志", module: "系统", danger: true, auditAction: "AUDIT_DELETE", auditEntity: "audit_log" },
  { key: "audit.retention.manage", name: "管理审计日志保留策略", module: "系统", danger: true, auditAction: "AUDIT_DELETE", auditEntity: "audit_log" },
  { key: "backup.run", name: "执行备份导出", module: "系统", danger: true, auditAction: "ADMIN_BACKUP", auditEntity: "backup" },
  { key: "restore.validate", name: "恢复前校验", module: "系统", danger: true, auditAction: "ADMIN_RESTORE_UPLOAD", auditEntity: "restore_job" },
  { key: "restore.run", name: "执行恢复", module: "系统", danger: true, auditAction: "ADMIN_RESTORE", auditEntity: "restore_job" },
  { key: "restore.cancel", name: "取消恢复任务", module: "系统", danger: true, auditAction: "ADMIN_RESTORE_JOB_CANCELED", auditEntity: "restore_job" },
  { key: "user.manage", name: "用户管理（含删除用户）", module: "系统", danger: true, auditAction: "USER_DELETE", auditEntity: "users" },
];

export const AUDIT_ACTION_LABELS_FROM_DANGER: Record<string, string> = Object.fromEntries(
  PERMISSION_DOC_ITEMS.filter(i => i.auditAction).map(i => [i.auditAction!, i.name])
);

export const AUDIT_ENTITY_LABELS_FROM_DANGER: Record<string, string> = Object.fromEntries(
  PERMISSION_DOC_ITEMS.filter(i => i.auditEntity).map(i => [i.auditEntity!, ({"配件仓":"配件仓对象","电脑仓":"电脑仓对象","系统":"系统对象"} as any)[i.module]])
);
