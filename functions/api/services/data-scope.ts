import { requireAuth, type AuthUser } from '../../_auth';

export type DataScopeType = 'all' | 'department';
export type UserDataScope = { data_scope_type: DataScopeType; data_scope_value: string | null };

function nowSql() {
  return "datetime('now','+8 hours')";
}

export function normalizeUserDataScope(type: string | null | undefined, value: string | null | undefined): UserDataScope {
  const rawType = String(type || '').trim().toLowerCase();
  const rawValue = String(value || '').trim().slice(0, 120);
  if (rawType === 'department' && rawValue) return { data_scope_type: 'department', data_scope_value: rawValue };
  return { data_scope_type: 'all', data_scope_value: null };
}

export async function ensureUserDataScopeColumns(db: D1Database) {
  try { await db.prepare(`ALTER TABLE users ADD COLUMN data_scope_type TEXT`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE users ADD COLUMN data_scope_value TEXT`).run(); } catch {}
  try { await db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_data_scope_type_value ON users(data_scope_type, data_scope_value)`).run(); } catch {}
  try {
    await db.prepare(`UPDATE users SET data_scope_type='all' WHERE COALESCE(TRIM(data_scope_type), '')=''`).run();
    await db.prepare(`UPDATE users SET data_scope_value=NULL WHERE TRIM(COALESCE(data_scope_type, 'all'))<>'department'`).run();
  } catch {}
}

export async function getUserDataScope(db: D1Database, userId: number) {
  await ensureUserDataScopeColumns(db);
  const row = await db.prepare(`SELECT data_scope_type, data_scope_value FROM users WHERE id=?`).bind(userId).first<any>();
  return normalizeUserDataScope(row?.data_scope_type, row?.data_scope_value);
}

export async function setUserDataScope(db: D1Database, userId: number, type: string | null | undefined, value: string | null | undefined) {
  await ensureUserDataScopeColumns(db);
  const normalized = normalizeUserDataScope(type, value);
  await db.prepare(`UPDATE users SET data_scope_type=?, data_scope_value=? WHERE id=?`).bind(normalized.data_scope_type, normalized.data_scope_value, userId).run();
  return normalized;
}

export async function requireAuthWithDataScope(env: { DB: D1Database; JWT_SECRET?: string }, request: Request, minRole: 'viewer' | 'operator' | 'admin' = 'viewer') {
  const user = await requireAuth(env as any, request, minRole);
  const scope = await getUserDataScope(env.DB, user.id).catch(() => ({ data_scope_type: 'all' as const, data_scope_value: null }));
  return Object.assign(user, scope) as AuthUser & UserDataScope;
}

export function applyDepartmentDataScopeClause(clauses: string[], binds: any[], columnExpr: string, scope?: UserDataScope | null) {
  if (!scope || scope.data_scope_type !== 'department' || !scope.data_scope_value) return;
  clauses.push(`TRIM(COALESCE(${columnExpr}, ''))=?`);
  binds.push(scope.data_scope_value);
}
