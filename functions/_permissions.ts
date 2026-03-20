import { requireAuth, type AuthUser } from './_auth';

export type PermissionCode =
  | 'system_settings_write'
  | 'audit_export'
  | 'asset_purge'
  | 'bulk_operation'
  | 'stocktake_apply'
  | 'ops_tools'
  | 'async_job_manage';

export const ALL_PERMISSION_CODES: PermissionCode[] = [
  'system_settings_write',
  'audit_export',
  'asset_purge',
  'bulk_operation',
  'stocktake_apply',
  'ops_tools',
  'async_job_manage',
];

function nowSql() {
  return "datetime('now','+8 hours')";
}

export async function ensureUserPermissionsTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL,
      permission_code TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (${nowSql()}),
      updated_by TEXT,
      PRIMARY KEY (user_id, permission_code),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  ).run();
}

export function roleDefaultPermission(role: string | null | undefined, code: PermissionCode) {
  const r = String(role || '').trim();
  if (r === 'admin') return true;
  if (r === 'operator') {
    return ['bulk_operation'].includes(code);
  }
  return false;
}

export async function getUserPermissionMap(db: D1Database, userId: number, role: string | null | undefined) {
  await ensureUserPermissionsTable(db);
  const map: Record<string, boolean> = {};
  for (const code of ALL_PERMISSION_CODES) map[code] = roleDefaultPermission(role, code);
  const { results } = await db.prepare(
    `SELECT permission_code, allowed FROM user_permissions WHERE user_id=?`
  ).bind(userId).all<any>();
  for (const row of results || []) {
    const code = String(row?.permission_code || '').trim() as PermissionCode;
    if (!ALL_PERMISSION_CODES.includes(code)) continue;
    map[code] = Number(row?.allowed || 0) === 1;
  }
  return map as Record<PermissionCode, boolean>;
}

export async function setUserPermissions(db: D1Database, userId: number, permissions: Partial<Record<PermissionCode, boolean>>, updatedBy: string | null) {
  await ensureUserPermissionsTable(db);
  const statements: D1PreparedStatement[] = [];
  for (const code of ALL_PERMISSION_CODES) {
    if (!(code in permissions)) continue;
    const allowed = permissions[code] ? 1 : 0;
    statements.push(db.prepare(
      `INSERT INTO user_permissions (user_id, permission_code, allowed, updated_at, updated_by)
       VALUES (?, ?, ?, ${nowSql()}, ?)
       ON CONFLICT(user_id, permission_code) DO UPDATE SET
         allowed=excluded.allowed,
         updated_at=${nowSql()},
         updated_by=excluded.updated_by`
    ).bind(userId, code, allowed, updatedBy));
  }
  if (statements.length) await db.batch(statements);
}

export async function requirePermission(env: { DB: D1Database; JWT_SECRET?: string }, request: Request, code: PermissionCode, minRole: 'viewer'|'operator'|'admin' = 'viewer') {
  const user = await requireAuth(env as any, request, minRole);
  if (user.role === 'admin') return user;
  const map = await getUserPermissionMap(env.DB, user.id, user.role);
  if (!map[code]) throw Object.assign(new Error('权限不足'), { status: 403 });
  return Object.assign(user, { permissions: map }) as AuthUser & { permissions: Record<PermissionCode, boolean> };
}
