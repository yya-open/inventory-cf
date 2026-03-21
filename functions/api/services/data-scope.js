import { requireAuth } from '../../_auth';
export const ASSET_WAREHOUSE_OPTIONS = ['配件仓', '电脑仓', '显示器仓'];
export function normalizeWarehouseScopeValue(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return null;
    const lower = raw.toLowerCase();
    if (['parts', 'part', '配件仓', '主仓'].includes(lower) || raw === '配件仓' || raw === '主仓')
        return '配件仓';
    if (['pc', '电脑仓'].includes(lower) || raw === '电脑仓')
        return '电脑仓';
    if (['monitor', '显示器仓'].includes(lower) || raw === '显示器仓')
        return '显示器仓';
    return raw.slice(0, 120);
}
export function normalizeDepartmentScopeValue(value) {
    const raw = String(value || '').trim();
    return raw ? raw.slice(0, 120) : null;
}
export function normalizeUserDataScope(type, value, value2) {
    const rawType = String(type || '').trim().toLowerCase();
    const department = normalizeDepartmentScopeValue(value);
    const warehouseSource = rawType === 'department_warehouse' ? value2 : (value || value2);
    const warehouse = normalizeWarehouseScopeValue(warehouseSource);
    if (rawType === 'department' && department)
        return { data_scope_type: 'department', data_scope_value: department, data_scope_value2: null };
    if (rawType === 'warehouse' && warehouse)
        return { data_scope_type: 'warehouse', data_scope_value: warehouse, data_scope_value2: null };
    if (rawType === 'department_warehouse' && department && warehouse) {
        return { data_scope_type: 'department_warehouse', data_scope_value: department, data_scope_value2: warehouse };
    }
    return { data_scope_type: 'all', data_scope_value: null, data_scope_value2: null };
}
export async function ensureUserDataScopeColumns(db) {
    try {
        await db.prepare(`ALTER TABLE users ADD COLUMN data_scope_type TEXT`).run();
    }
    catch { }
    try {
        await db.prepare(`ALTER TABLE users ADD COLUMN data_scope_value TEXT`).run();
    }
    catch { }
    try {
        await db.prepare(`ALTER TABLE users ADD COLUMN data_scope_value2 TEXT`).run();
    }
    catch { }
    try {
        await db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_data_scope_type_value_v2 ON users(data_scope_type, data_scope_value, data_scope_value2)`).run();
    }
    catch { }
    try {
        await db.prepare(`UPDATE users SET data_scope_type='all' WHERE COALESCE(TRIM(data_scope_type), '')=''`).run();
        await db.prepare(`UPDATE users SET data_scope_value=NULL, data_scope_value2=NULL WHERE TRIM(COALESCE(data_scope_type, 'all'))='all'`).run();
        await db.prepare(`UPDATE users SET data_scope_value2=NULL WHERE TRIM(COALESCE(data_scope_type, 'all')) IN ('department','warehouse')`).run();
    }
    catch { }
}
export async function getUserDataScope(db, userId) {
    await ensureUserDataScopeColumns(db);
    const row = await db.prepare(`SELECT data_scope_type, data_scope_value, data_scope_value2 FROM users WHERE id=?`).bind(userId).first();
    return normalizeUserDataScope(row?.data_scope_type, row?.data_scope_value, row?.data_scope_value2);
}
export async function setUserDataScope(db, userId, type, value, value2) {
    await ensureUserDataScopeColumns(db);
    const normalized = normalizeUserDataScope(type, value, value2);
    await db.prepare(`UPDATE users SET data_scope_type=?, data_scope_value=?, data_scope_value2=? WHERE id=?`).bind(normalized.data_scope_type, normalized.data_scope_value, normalized.data_scope_value2, userId).run();
    return normalized;
}
export async function requireAuthWithDataScope(env, request, minRole = 'viewer') {
    const user = await requireAuth(env, request, minRole);
    const scope = await getUserDataScope(env.DB, user.id).catch(() => ({ data_scope_type: 'all', data_scope_value: null, data_scope_value2: null }));
    return Object.assign(user, scope);
}
export function applyDepartmentDataScopeClause(clauses, binds, columnExpr, scope) {
    if (!scope || !['department', 'department_warehouse'].includes(scope.data_scope_type) || !scope.data_scope_value)
        return;
    clauses.push(`TRIM(COALESCE(${columnExpr}, ''))=?`);
    binds.push(scope.data_scope_value);
}
export function getRequiredWarehouse(scope) {
    if (!scope || !['warehouse', 'department_warehouse'].includes(scope.data_scope_type))
        return null;
    return normalizeWarehouseScopeValue(scope.data_scope_type === 'warehouse' ? scope.data_scope_value : scope.data_scope_value2);
}
export function scopeAllowsAssetWarehouse(scope, warehouseName) {
    const required = getRequiredWarehouse(scope);
    if (!required)
        return true;
    return required === warehouseName;
}
export function assertAssetWarehouseAccess(scope, warehouseName, moduleLabel) {
    if (scopeAllowsAssetWarehouse(scope, warehouseName))
        return;
    const suffix = moduleLabel ? `，无法访问${moduleLabel}` : '';
    throw Object.assign(new Error(`当前账号的数据范围未包含${warehouseName}${suffix}`), { status: 403 });
}
export async function assertPartsWarehouseAccess(db, scope, requestedWarehouseId, moduleLabel) {
    assertAssetWarehouseAccess(scope, '配件仓', moduleLabel);
    const warehouseId = await resolvePartsWarehouseId(db, scope, requestedWarehouseId);
    if (warehouseId <= 0) {
        throw Object.assign(new Error('当前账号未授权访问该配件仓'), { status: 403 });
    }
    return warehouseId;
}
export async function assertPartsStocktakeAccess(db, scope, stocktakeId, moduleLabel) {
    const stocktake = await db.prepare(`SELECT id, warehouse_id FROM stocktake WHERE id=?`).bind(stocktakeId).first();
    if (!stocktake)
        return null;
    await assertPartsWarehouseAccess(db, scope, Number(stocktake.warehouse_id || 0), moduleLabel || '盘点');
    return stocktake;
}
export async function resolvePartsWarehouseId(db, scope, requestedWarehouseId) {
    const required = getRequiredWarehouse(scope);
    if (!required)
        return Number(requestedWarehouseId || 1) || 1;
    if (required !== '配件仓') {
        return -1;
    }
    const requested = Number(requestedWarehouseId || 1) || 1;
    if (requested > 0) {
        const row = await db.prepare(`SELECT id, name FROM warehouses WHERE id=?`).bind(requested).first().catch(() => null);
        if (row)
            return Number(row.id || requested);
    }
    return 1;
}
