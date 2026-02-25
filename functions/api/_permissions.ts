import { requireAuth, type AuthUser } from "./_auth";

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

const ADMIN_ONLY = new Set<PermissionKey>([
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
]);

const OPERATOR_PLUS = new Set<PermissionKey>(["pcAsset.update"]);

export function hasPermission(user: Pick<AuthUser, "role"> | null | undefined, perm: PermissionKey): boolean {
  if (!user?.role) return false;
  if (user.role === "admin") return ADMIN_ONLY.has(perm) || OPERATOR_PLUS.has(perm);
  if (user.role === "operator") return OPERATOR_PLUS.has(perm);
  return false;
}

export async function requirePermission(
  env: { DB: D1Database; JWT_SECRET?: string },
  request: Request,
  perm: PermissionKey
): Promise<AuthUser> {
  const user = await requireAuth(env as any, request, "viewer");
  if (!hasPermission(user, perm)) {
    const e: any = new Error("权限不足");
    e.status = 403;
    throw e;
  }
  return user;
}
