import { requireAuth, type AuthUser } from './_auth';

export type PermissionCode =
  | 'system_settings_write'
  | 'audit_export'
  | 'asset_purge'
  | 'bulk_operation'
  | 'stocktake_apply'
  | 'ops_tools'
  | 'async_job_manage'
  | 'qr_export'
  | 'qr_reset';

export type PermissionTemplateCode = 'admin_full' | 'admin_ops' | 'operator_plus' | 'auditor' | 'readonly';

export const ALL_PERMISSION_CODES: PermissionCode[] = [
  'system_settings_write',
  'audit_export',
  'asset_purge',
  'bulk_operation',
  'stocktake_apply',
  'ops_tools',
  'async_job_manage',
  'qr_export',
  'qr_reset',
];

export const PERMISSION_TEMPLATES: Record<PermissionTemplateCode, { label: string; role_hint: 'admin'|'operator'|'viewer'; permissions: Record<PermissionCode, boolean> }> = {
  admin_full: {
    label: '管理员-完全权限',
    role_hint: 'admin',
    permissions: Object.fromEntries(ALL_PERMISSION_CODES.map((code) => [code, true])) as Record<PermissionCode, boolean>,
  },
  admin_ops: {
    label: '管理员-运维模板',
    role_hint: 'admin',
    permissions: {
      system_settings_write: false,
      audit_export: true,
      asset_purge: false,
      bulk_operation: true,
      stocktake_apply: true,
      ops_tools: true,
      async_job_manage: true,
      qr_export: true,
      qr_reset: true,
    },
  },
  operator_plus: {
    label: '操作员-增强模板',
    role_hint: 'operator',
    permissions: {
      system_settings_write: false,
      audit_export: false,
      asset_purge: false,
      bulk_operation: true,
      stocktake_apply: false,
      ops_tools: false,
      async_job_manage: false,
      qr_export: true,
      qr_reset: false,
    },
  },
  auditor: {
    label: '审计员模板',
    role_hint: 'viewer',
    permissions: {
      system_settings_write: false,
      audit_export: true,
      asset_purge: false,
      bulk_operation: false,
      stocktake_apply: false,
      ops_tools: false,
      async_job_manage: false,
      qr_export: false,
      qr_reset: false,
    },
  },
  readonly: {
    label: '只读模板',
    role_hint: 'viewer',
    permissions: {
      system_settings_write: false,
      audit_export: false,
      asset_purge: false,
      bulk_operation: false,
      stocktake_apply: false,
      ops_tools: false,
      async_job_manage: false,
      qr_export: false,
      qr_reset: false,
    },
  },
};

export const ALL_PERMISSION_TEMPLATE_CODES = Object.keys(PERMISSION_TEMPLATES) as PermissionTemplateCode[];

function nowSql() {
  return "datetime('now','+8 hours')";
}

let ensureUserPermissionsTablePromise: Promise<void> | null = null;
let ensureUserPermissionTemplateColumnPromise: Promise<void> | null = null;

function createPermissionSchemaMissingError() {
  return Object.assign(new Error('权限数据库结构未就绪，请先执行迁移（npm run migrate:apply -- --db <db> --remote）'), { status: 503, code: 'SCHEMA_NOT_READY' });
}

async function probeUserPermissionsTableReady(db: D1Database) {
  try {
    const checks = await db.batch([
      db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='user_permissions'"),
      db.prepare("SELECT 1 AS ok FROM pragma_table_info('user_permissions') WHERE name='user_id'"),
      db.prepare("SELECT 1 AS ok FROM pragma_table_info('user_permissions') WHERE name='permission_code'"),
      db.prepare("SELECT 1 AS ok FROM pragma_table_info('user_permissions') WHERE name='allowed'"),
      db.prepare("SELECT 1 AS ok FROM pragma_table_info('user_permissions') WHERE name='updated_at'"),
      db.prepare("SELECT 1 AS ok FROM pragma_table_info('user_permissions') WHERE name='updated_by'"),
    ]);
    return checks.every((item: any) => Number(item?.results?.[0]?.ok || 0) === 1);
  } catch {
    return false;
  }
}

async function probeUserPermissionTemplateColumnReady(db: D1Database) {
  try {
    const row = await db.prepare("SELECT 1 AS ok FROM pragma_table_info('users') WHERE name='permission_template_code'").first<any>();
    return Number(row?.ok || 0) === 1;
  } catch {
    return false;
  }
}

export async function ensureUserPermissionsTable(db: D1Database) {
  if (!ensureUserPermissionsTablePromise) {
    ensureUserPermissionsTablePromise = (async () => {
      const ready = await probeUserPermissionsTableReady(db);
      if (!ready) throw createPermissionSchemaMissingError();
    })().catch((error) => {
      ensureUserPermissionsTablePromise = null;
      throw error;
    });
  }
  await ensureUserPermissionsTablePromise;
}

export async function ensureUserPermissionTemplateColumn(db: D1Database) {
  if (!ensureUserPermissionTemplateColumnPromise) {
    ensureUserPermissionTemplateColumnPromise = (async () => {
      const ready = await probeUserPermissionTemplateColumnReady(db);
      if (!ready) throw createPermissionSchemaMissingError();
    })().catch((error) => {
      ensureUserPermissionTemplateColumnPromise = null;
      throw error;
    });
  }
  await ensureUserPermissionTemplateColumnPromise;
}

export function roleDefaultPermission(role: string | null | undefined, code: PermissionCode) {
  const r = String(role || '').trim();
  if (r === 'admin') return true;
  if (r === 'operator') return ['bulk_operation', 'qr_export'].includes(code);
  return false;
}

export function defaultTemplateForRole(role: string | null | undefined): PermissionTemplateCode {
  const r = String(role || '').trim();
  if (r === 'admin') return 'admin_full';
  if (r === 'operator') return 'operator_plus';
  return 'readonly';
}

export function normalizePermissionTemplateCode(role: string | null | undefined, templateCode: string | null | undefined): PermissionTemplateCode {
  const raw = String(templateCode || '').trim() as PermissionTemplateCode;
  return ALL_PERMISSION_TEMPLATE_CODES.includes(raw) ? raw : defaultTemplateForRole(role);
}

export function getPermissionTemplateMap(role: string | null | undefined, templateCode: string | null | undefined) {
  const code = normalizePermissionTemplateCode(role, templateCode);
  return { code, ...PERMISSION_TEMPLATES[code] };
}

export async function getUserPermissionMap(db: D1Database, userId: number, role: string | null | undefined, templateCode?: string | null) {
  await ensureUserPermissionsTable(db);
  await ensureUserPermissionTemplateColumn(db);
  const map: Record<string, boolean> = {};
  for (const code of ALL_PERMISSION_CODES) map[code] = roleDefaultPermission(role, code);
  const template = getPermissionTemplateMap(role, templateCode);
  for (const code of ALL_PERMISSION_CODES) map[code] = !!template.permissions[code];
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

export async function setUserPermissionTemplate(db: D1Database, userId: number, role: string | null | undefined, templateCode: string | null | undefined) {
  await ensureUserPermissionTemplateColumn(db);
  const code = normalizePermissionTemplateCode(role, templateCode);
  await db.prepare(`UPDATE users SET permission_template_code=? WHERE id=?`).bind(code, userId).run();
  return code;
}

export async function getUserTemplateCode(db: D1Database, userId: number, role: string | null | undefined) {
  await ensureUserPermissionTemplateColumn(db);
  const row = await db.prepare(`SELECT permission_template_code FROM users WHERE id=?`).bind(userId).first<any>();
  return normalizePermissionTemplateCode(role, row?.permission_template_code);
}

export async function requirePermission(env: { DB: D1Database; JWT_SECRET?: string }, request: Request, code: PermissionCode, minRole: 'viewer'|'operator'|'admin' = 'viewer') {
  const user = await requireAuth(env as any, request, minRole);
  const templateCode = await getUserTemplateCode(env.DB, user.id, user.role).catch(() => defaultTemplateForRole(user.role));
  if (user.role === 'admin' && templateCode === 'admin_full') return Object.assign(user, { permission_template_code: templateCode });
  const map = await getUserPermissionMap(env.DB, user.id, user.role, templateCode);
  if (!map[code]) throw Object.assign(new Error('权限不足'), { status: 403 });
  return Object.assign(user, { permissions: map, permission_template_code: templateCode }) as AuthUser & { permissions: Record<PermissionCode, boolean>; permission_template_code: PermissionTemplateCode };
}
