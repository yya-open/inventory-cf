export type Role = "admin" | "operator" | "viewer";
const ROLE_LEVEL: Record<Role, number> = { viewer: 1, operator: 2, admin: 3 };
export function roleLevel(role: Role) { return ROLE_LEVEL[role]; }
export function hasRole(userRole: Role | null | undefined, minRole: Role) {
  if (!userRole) return false;
  return roleLevel(userRole) >= roleLevel(minRole);
}
