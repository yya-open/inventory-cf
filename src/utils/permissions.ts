import type { Role } from "../store/auth";
import { useAuth } from "../store/auth";

export type PermissionKey =
  | "tx.clear"
  | "pcTx.delete"
  | "pcTx.clear"
  | "audit.delete"
  | "audit.retention.manage"
  | "backup.run"
  | "restore.run"
  | "restore.validate"
  | "restore.cancel"
  | "pcAsset.delete"
  | "pcAsset.update"
  | "item.delete"
  | "user.manage"
  | "stocktake.delete"
  | "stocktake.rollback"
  | "stocktake.apply";

const ADMIN_ONLY: PermissionKey[] = [
  "tx.clear",
  "pcTx.delete",
  "pcTx.clear",
  "audit.delete",
  "audit.retention.manage",
  "backup.run",
  "restore.run",
  "restore.validate",
  "restore.cancel",
  "pcAsset.delete",
  "item.delete",
  "user.manage",
  "stocktake.delete",
  "stocktake.rollback",
  "stocktake.apply",
];

const OPERATOR_PLUS: PermissionKey[] = [
  "pcAsset.update",
];

const roleMatrix: Record<Role, Set<PermissionKey>> = {
  admin: new Set<PermissionKey>([...ADMIN_ONLY, ...OPERATOR_PLUS]),
  operator: new Set<PermissionKey>([...OPERATOR_PLUS]),
  viewer: new Set<PermissionKey>([]),
};

export function hasPermission(role: Role | undefined | null, perm: PermissionKey): boolean {
  if (!role) return false;
  return roleMatrix[role]?.has(perm) || false;
}

export function canPerm(perm: PermissionKey): boolean {
  const auth = useAuth();
  return hasPermission(auth.user?.role, perm);
}
