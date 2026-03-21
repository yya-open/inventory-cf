const ROLE_LEVEL = { viewer: 1, operator: 2, admin: 3 };
export function roleLevel(role) { return ROLE_LEVEL[role]; }
export function hasRole(userRole, minRole) {
    if (!userRole)
        return false;
    return roleLevel(userRole) >= roleLevel(minRole);
}
