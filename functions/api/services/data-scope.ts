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

let ensureUserDataScopeColumnsPromise: Promise<void> | null = null;
const USER_DATA_SCOPE_CACHE_TTL_MS = 30_000;
const userDataScopeCache = new Map<number, UserDataScope & { expiresAt: number }>();

function readCachedUserDataScope(userId: number) {
  const hit = userDataScopeCache.get(userId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    userDataScopeCache.delete(userId);
    return null;
  }
  return { data_scope_type: hit.data_scope_type, data_scope_value: hit.data_scope_value, data_scope_value2: hit.data_scope_value2 } as UserDataScope;
}

function writeCachedUserDataScope(userId: number, scope: UserDataScope) {
  userDataScopeCache.set(userId, { ...scope, expiresAt: Date.now() + USER_DATA_SCOPE_CACHE_TTL_MS });
  return scope;
}

export function invalidateUserDataScopeCache(userId?: number | null) {
  if (typeof userId === 'number' && Number.isFinite(userId) && userId > 0) {
    userDataScopeCache.delete(userId);
    return;
  }
  userDataScopeCache.clear();
}

export async function ensureUserDataScopeColumns(db: D1Database) {
  if (!ensureUserDataScopeColumnsPromise) {
    ensureUserDataScopeColumnsPromise = (async () => {
      try { await db.prepare(`ALTER TABLE users ADD COLUMN data_scope_type TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN data_scope_value TEXT`).run(); } catch {}
      try { await db.prepare(`ALTER TABLE users ADD COLUMN data_scope_value2 TEXT`).run(); } catch {}
      try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_data_scope_type_value_v2 ON users(data_scope_type, data_scope_value, data_scope_value2)`).run(); } catch {}
      try {
        await db.prepare(`UPDATE users SET data_scope_type='all' WHERE COALESCE(TRIM(data_scope_type), '')=''`).run();
        await db.prepare(`UPDATE users SET data_scope_value=NULL, data_scope_value2=NULL WHERE TRIM(COALESCE(data_scope_type, 'all'))='all'`).run();
        await db.prepare(`UPDATE users SET data_scope_value2=NULL WHERE TRIM(COALESCE(data_scope_type, 'all')) IN ('department','warehouse')`).run();
      } catch {}
    })().catch((error) => {
      ensureUserDataScopeColumnsPromise = null;
      throw error;
    });
  }
  await ensureUserDataScopeColumnsPromise;
}

export async function getUserDataScope(db: D1Database, userId: number) {
  const cached = readCachedUserDataScope(userId);
  if (cached) return cached;
  await ensureUserDataScopeColumns(db);
  const row = await db.prepare(`SELECT data_scope_type, data_scope_value, data_scope_value2 FROM users WHERE id=?`).bind(userId).first<any>();
  return writeCachedUserDataScope(userId, normalizeUserDataScope(row?.data_scope_type, row?.data_scope_value, row?.data_scope_value2));
}

export async function setUserDataScope(db: D1Database, userId: number, type: string | null | undefined, value: string | null | undefined, value2?: string | null | undefined) {
  await ensureUserDataScopeColumns(db);
  const normalized = normalizeUserDataScope(type, value, value2);
  await db.prepare(`UPDATE users SET data_scope_type=?, data_scope_value=?, data_scope_value2=? WHERE id=?`).bind(normalized.data_scope_type, normalized.data_scope_value, normalized.data_scope_value2, userId).run();
  writeCachedUserDataScope(userId, normalized);
  return normalized;
}

export async function requireAuthWithDataScope(env: { DB: D1Database; JWT_SECRET?: string }, request: Request, minRole: 'viewer' | 'operator' | 'admin' = 'viewer') {
  const user = await requireAuth(env as any, request, minRole);
  const scope = await getUserDataScope(env.DB, user.id).catch(() => ({ data_scope_type: 'all' as const, data_scope_value: null, data_scope_value2: null }));
  return Object.assign(user, scope) as AuthUser & UserDataScope;
}

export function applyDepartmentDataScopeClause(clauses: string[], binds: any[], columnExpr: string, scope?: UserDataScope | null) {
  if (!scope || !['department', 'department_warehouse'].includes(scope.data_scope_type) || !scope.data_scope_value) return;
  clauses.push(`COALESCE(${columnExpr}, '')=?`);
  binds.push(scope.data_scope_value);
}

export function getRequiredDepartment(scope?: UserDataScope | null) {
  if (!scope || !['department', 'department_warehouse'].includes(scope.data_scope_type)) return null;
  return normalizeDepartmentScopeValue(scope.data_scope_value);
}

export function scopeAllowsDepartment(scope: UserDataScope | null | undefined, departmentValue?: string | null) {
  const required = getRequiredDepartment(scope);
  if (!required) return true;
  return normalizeDepartmentScopeValue(departmentValue) === required;
}

export function assertDepartmentScopeAccess(scope: UserDataScope | null | undefined, departmentValue?: string | null, moduleLabel?: string) {
  const required = getRequiredDepartment(scope);
  if (!required) return;
  if (normalizeDepartmentScopeValue(departmentValue) === required) return;
  const suffix = moduleLabel ? `，无法访问${moduleLabel}` : '';
  throw Object.assign(new Error(`当前账号的数据范围未包含部门「${required}」${suffix}`), { status: 403, error_code: 'SCOPE_DEPARTMENT_DENIED' });
}

export async function getPcAssetCurrentDepartment(db: D1Database, assetId: number) {
  if (!Number.isFinite(assetId) || assetId <= 0) return null;
  const row = await db.prepare(`SELECT a.id, s.current_department FROM pc_assets a LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id WHERE a.id=?`).bind(assetId).first<any>().catch(() => null);
  if (!row) return null;
  return { id: Number(row.id || 0), current_department: normalizeDepartmentScopeValue(row.current_department) };
}

export async function assertPcAssetDataScopeAccess(db: D1Database, scope: UserDataScope | null | undefined, assetId: number, moduleLabel?: string) {
  assertAssetWarehouseAccess(scope, '电脑仓', moduleLabel);
  const snapshot = await getPcAssetCurrentDepartment(db, assetId);
  if (!snapshot) return null;
  assertDepartmentScopeAccess(scope, snapshot.current_department, moduleLabel);
  return snapshot;
}

export function assertMonitorAssetDataScopeAccess(scope: UserDataScope | null | undefined, departmentValue?: string | null, moduleLabel?: string) {
  assertAssetWarehouseAccess(scope, '显示器仓', moduleLabel);
  assertDepartmentScopeAccess(scope, departmentValue, moduleLabel);
}

export async function assertPcAssetIdsDataScopeAccess(db: D1Database, scope: UserDataScope | null | undefined, assetIds: number[], moduleLabel?: string) {
  assertAssetWarehouseAccess(scope, '电脑仓', moduleLabel);
  const required = getRequiredDepartment(scope);
  const ids = Array.from(new Set((Array.isArray(assetIds) ? assetIds : []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)));
  if (!required || !ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT a.id, s.current_department FROM pc_assets a LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id WHERE a.id IN (${placeholders})`).bind(...ids).all<any>().catch(() => ({ results: [] as any[] }));
  for (const row of Array.isArray(rows?.results) ? rows.results : []) {
    if (scopeAllowsDepartment(scope, row?.current_department)) continue;
    throw Object.assign(new Error(`当前账号的数据范围未包含资产 #${Number(row?.id || 0)} 所属部门${moduleLabel ? `，无法访问${moduleLabel}` : ''}`), { status: 403, error_code: 'SCOPE_DEPARTMENT_DENIED' });
  }
}

export async function assertMonitorAssetIdsDataScopeAccess(db: D1Database, scope: UserDataScope | null | undefined, assetIds: number[], moduleLabel?: string) {
  assertAssetWarehouseAccess(scope, '显示器仓', moduleLabel);
  const required = getRequiredDepartment(scope);
  const ids = Array.from(new Set((Array.isArray(assetIds) ? assetIds : []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)));
  if (!required || !ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT id, department FROM monitor_assets WHERE id IN (${placeholders})`).bind(...ids).all<any>().catch(() => ({ results: [] as any[] }));
  for (const row of Array.isArray(rows?.results) ? rows.results : []) {
    if (scopeAllowsDepartment(scope, row?.department)) continue;
    throw Object.assign(new Error(`当前账号的数据范围未包含资产 #${Number(row?.id || 0)} 所属部门${moduleLabel ? `，无法访问${moduleLabel}` : ''}`), { status: 403, error_code: 'SCOPE_DEPARTMENT_DENIED' });
  }
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
  throw Object.assign(new Error(`当前账号的数据范围未包含${warehouseName}${suffix}`), { status: 403, error_code: 'SCOPE_WAREHOUSE_DENIED' });
}

export async function assertPartsWarehouseAccess(db: D1Database, scope?: UserDataScope | null, requestedWarehouseId?: number | null, moduleLabel?: string) {
  assertAssetWarehouseAccess(scope, '配件仓', moduleLabel);
  const warehouseId = await resolvePartsWarehouseId(db, scope, requestedWarehouseId);
  if (warehouseId <= 0) {
    throw Object.assign(new Error('当前账号未授权访问该配件仓'), { status: 403, error_code: 'SCOPE_PARTS_WAREHOUSE_DENIED' });
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
    if (row) {
      const normalized = normalizeWarehouseScopeValue(row?.name);
      if (normalized === '配件仓') return Number(row.id || requested);
      return -1;
    }
  }
  const fallback = await db.prepare(`SELECT id, name FROM warehouses ORDER BY id ASC`).all<any>().catch(() => ({ results: [] as any[] }));
  for (const row of Array.isArray(fallback?.results) ? fallback.results : []) {
    if (normalizeWarehouseScopeValue(row?.name) === '配件仓') return Number(row?.id || 0) || 1;
  }
  return 1;
}
