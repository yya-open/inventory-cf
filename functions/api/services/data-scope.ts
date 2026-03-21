import { requireAuth, type AuthUser } from '../../_auth';

export type DataScopeType = 'all' | 'department' | 'warehouse' | 'department_warehouse';
export type UserDataScope = {
  data_scope_type: DataScopeType;
  data_scope_value: string | null;
  data_scope_value2: string | null;
};

export const ASSET_WAREHOUSE_OPTIONS = ['配件仓', '电脑仓', '显示器仓'] as const;

export function normalizeWarehouseScopeValue(value: any) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (['parts', 'part', '配件仓', '主仓'].includes(lower) || raw === '配件仓' || raw === '主仓') return '配件仓';
  if (['pc', '电脑仓'].includes(lower) || raw === '电脑仓') return '电脑仓';
  if (['monitor', '显示器仓'].includes(lower) || raw === '显示器仓') return '显示器仓';
  return raw.slice(0, 120);
}

export function normalizeDepartmentScopeValue(value: any) {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, 120) : null;
}

export function normalizeUserDataScope(type: string | null | undefined, value: string | null | undefined, value2?: string | null | undefined): UserDataScope {
  const rawType = String(type || '').trim().toLowerCase();
  const department = normalizeDepartmentScopeValue(value);
  const warehouseSource = rawType === 'department_warehouse' ? value2 : (value || value2);
  const warehouse = normalizeWarehouseScopeValue(warehouseSource);

  if (rawType === 'department' && department) return { data_scope_type: 'department', data_scope_value: department, data_scope_value2: null };
  if (rawType === 'warehouse' && warehouse) return { data_scope_type: 'warehouse', data_scope_value: warehouse, data_scope_value2: null };
  if (rawType === 'department_warehouse' && department && warehouse) {
    return { data_scope_type: 'department_warehouse', data_scope_value: department, data_scope_value2: warehouse };
  }
  return { data_scope_type: 'all', data_scope_value: null, data_scope_value2: null };
}

export async function ensureUserDataScopeColumns(db: D1Database) {
  try { await db.prepare(`ALTER TABLE users ADD COLUMN data_scope_type TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN data_scope_value TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN data_scope_value2 TEXT`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_data_scope_type_value_v2 ON users(data_scope_type, data_scope_value, data_scope_value2)`).run(); } catch {}
  try {
    await db.prepare(`UPDATE users SET data_scope_type='all' WHERE COALESCE(TRIM(data_scope_type), '')=''`).run();
    await db.prepare(`UPDATE users SET data_scope_value=NULL, data_scope_value2=NULL WHERE TRIM(COALESCE(data_scope_type, 'all'))='all'`).run();
    await db.prepare(`UPDATE users SET data_scope_value2=NULL WHERE TRIM(COALESCE(data_scope_type, 'all')) IN ('department','warehouse')`).run();
  } catch {}
}

export async function getUserDataScope(db: D1Database, userId: number) {
  await ensureUserDataScopeColumns(db);
  const row = await db.prepare(`SELECT data_scope_type, data_scope_value, data_scope_value2 FROM users WHERE id=?`).bind(userId).first<any>();
  return normalizeUserDataScope(row?.data_scope_type, row?.data_scope_value, row?.data_scope_value2);
}

export async function setUserDataScope(db: D1Database, userId: number, type: string | null | undefined, value: string | null | undefined, value2?: string | null | undefined) {
  await ensureUserDataScopeColumns(db);
  const normalized = normalizeUserDataScope(type, value, value2);
  await db.prepare(`UPDATE users SET data_scope_type=?, data_scope_value=?, data_scope_value2=? WHERE id=?`).bind(normalized.data_scope_type, normalized.data_scope_value, normalized.data_scope_value2, userId).run();
  return normalized;
}

export async function requireAuthWithDataScope(env: { DB: D1Database; JWT_SECRET?: string }, request: Request, minRole: 'viewer' | 'operator' | 'admin' = 'viewer') {
  const user = await requireAuth(env as any, request, minRole);
  const scope = await getUserDataScope(env.DB, user.id).catch(() => ({ data_scope_type: 'all' as const, data_scope_value: null, data_scope_value2: null }));
  return Object.assign(user, scope) as AuthUser & UserDataScope;
}

export function applyDepartmentDataScopeClause(clauses: string[], binds: any[], columnExpr: string, scope?: UserDataScope | null) {
  if (!scope || !['department', 'department_warehouse'].includes(scope.data_scope_type) || !scope.data_scope_value) return;
  clauses.push(`TRIM(COALESCE(${columnExpr}, ''))=?`);
  binds.push(scope.data_scope_value);
}

export function getRequiredWarehouse(scope?: UserDataScope | null) {
  if (!scope || !['warehouse', 'department_warehouse'].includes(scope.data_scope_type)) return null;
  return normalizeWarehouseScopeValue(scope.data_scope_type === 'warehouse' ? scope.data_scope_value : scope.data_scope_value2);
}

export function scopeAllowsAssetWarehouse(scope: UserDataScope | null | undefined, warehouseName: '电脑仓' | '显示器仓' | '配件仓') {
  const required = getRequiredWarehouse(scope);
  if (!required) return true;
  return required === warehouseName;
}

export function assertAssetWarehouseAccess(scope: UserDataScope | null | undefined, warehouseName: '电脑仓' | '显示器仓' | '配件仓', moduleLabel?: string) {
  if (scopeAllowsAssetWarehouse(scope, warehouseName)) return;
  const suffix = moduleLabel ? `，无法访问${moduleLabel}` : '';
  throw Object.assign(new Error(`当前账号的数据范围未包含${warehouseName}${suffix}`), { status: 403 });
}

export async function assertPartsWarehouseAccess(db: D1Database, scope?: UserDataScope | null, requestedWarehouseId?: number | null, moduleLabel?: string) {
  assertAssetWarehouseAccess(scope, '配件仓', moduleLabel);
  const warehouseId = await resolvePartsWarehouseId(db, scope, requestedWarehouseId);
  if (warehouseId <= 0) {
    throw Object.assign(new Error('当前账号未授权访问该配件仓'), { status: 403 });
  }
  return warehouseId;
}

export async function assertPartsStocktakeAccess(db: D1Database, scope: UserDataScope | null | undefined, stocktakeId: number, moduleLabel?: string) {
  const stocktake = await db.prepare(`SELECT id, warehouse_id FROM stocktake WHERE id=?`).bind(stocktakeId).first<any>();
  if (!stocktake) return null;
  await assertPartsWarehouseAccess(db, scope, Number(stocktake.warehouse_id || 0), moduleLabel || '盘点');
  return stocktake;
}

export async function resolvePartsWarehouseId(db: D1Database, scope?: UserDataScope | null, requestedWarehouseId?: number | null) {
  const required = getRequiredWarehouse(scope);
  if (!required) return Number(requestedWarehouseId || 1) || 1;
  if (required !== '配件仓') {
    return -1;
  }
  const requested = Number(requestedWarehouseId || 1) || 1;
  if (requested > 0) {
    const row = await db.prepare(`SELECT id, name FROM warehouses WHERE id=?`).bind(requested).first<any>().catch(() => null);
    if (row) return Number(row.id || requested);
  }
  return 1;
}
