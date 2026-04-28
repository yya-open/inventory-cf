import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../functions/api/_audit', () => ({
  logAudit: vi.fn(async () => {}),
}));

vi.mock('../functions/api/services/master-data', () => ({
  assertDepartmentDictionaryValue: vi.fn(async (_db: any, value: any) => value),
  assertWarehouseDictionaryValue: vi.fn(async (_db: any, value: any) => value),
}));

vi.mock('../functions/_permissions', () => {
  const ALL_PERMISSION_CODES = [
    'system_settings_write',
    'audit_export',
    'asset_purge',
    'bulk_operation',
    'stocktake_apply',
    'ops_tools',
    'async_job_manage',
    'qr_export',
    'qr_reset',
  ] as const;
  const ALL_PERMISSION_TEMPLATE_CODES = ['admin_full', 'admin_ops', 'operator_plus', 'auditor', 'readonly'] as const;

  const defaultTemplateForRole = (role: string | null | undefined) => {
    if (role === 'admin') return 'admin_full';
    if (role === 'operator') return 'operator_plus';
    return 'readonly';
  };

  const normalizePermissionTemplateCode = (role: string | null | undefined, templateCode: string | null | undefined) => {
    return (ALL_PERMISSION_TEMPLATE_CODES as readonly string[]).includes(String(templateCode || ''))
      ? String(templateCode)
      : defaultTemplateForRole(role);
  };

  const buildPermissionMap = (role: string | null | undefined) => {
    const map: Record<string, boolean> = Object.fromEntries(ALL_PERMISSION_CODES.map((code) => [code, false]));
    if (role === 'admin') {
      for (const code of ALL_PERMISSION_CODES) map[code] = true;
    } else if (role === 'operator') {
      map.bulk_operation = true;
      map.qr_export = true;
    }
    return map;
  };

  return {
    ALL_PERMISSION_CODES,
    ALL_PERMISSION_TEMPLATE_CODES,
    normalizePermissionTemplateCode,
    ensureUserPermissionTemplateColumn: vi.fn(async () => {}),
    ensureUserPermissionsTable: vi.fn(async () => {}),
    setUserPermissions: vi.fn(async () => {}),
    setUserPermissionTemplate: vi.fn(async (db: any, userId: number, role: string | null | undefined, templateCode: string | null | undefined) => {
      const code = normalizePermissionTemplateCode(role, templateCode);
      const user = db.__getUser(userId);
      if (user) user.permission_template_code = code;
      return code;
    }),
    getUserTemplateCode: vi.fn(async (db: any, userId: number, role: string | null | undefined) => {
      const user = db.__getUser(userId);
      return normalizePermissionTemplateCode(role, user?.permission_template_code);
    }),
    getUserPermissionMap: vi.fn(async (_db: any, _userId: number, role: string | null | undefined) => buildPermissionMap(role)),
    getPermissionTemplateMap: vi.fn((role: string | null | undefined, templateCode: string | null | undefined) => ({
      code: normalizePermissionTemplateCode(role, templateCode),
      label: 'mock',
      role_hint: role === 'admin' ? 'admin' : role === 'operator' ? 'operator' : 'viewer',
      permissions: buildPermissionMap(role),
    })),
  };
});

import { buildAuthCookie, invalidateCachedAuthUser, requireAuth, signJwt } from '../functions/_auth';
import { hashPassword } from '../functions/_password';
import { invalidateCachedMe, onRequestGet as meHandler } from '../functions/api/auth/me';
import { onRequestPost as changePasswordHandler } from '../functions/api/auth/change-password';
import { onRequestPost as logoutHandler } from '../functions/api/auth/logout';
import { onRequestPut as updateUserHandler } from '../functions/api/users';
import { invalidateUserDataScopeCache } from '../functions/api/services/data-scope';

type UserRow = {
  id: number;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  is_active: number;
  must_change_password: number;
  token_version: number;
  acl_version: number;
  password_hash: string;
  permission_template_code: string | null;
  data_scope_type: string | null;
  data_scope_value: string | null;
  data_scope_value2: string | null;
  created_at: string;
};

class FakeStatement {
  private params: any[] = [];

  constructor(private db: FakeDB, private sql: string) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async first<T = any>() {
    return this.db.execute(this.sql, this.params, 'first') as T;
  }

  async all<T = any>() {
    return { results: this.db.execute(this.sql, this.params, 'all') as T[] };
  }

  async run() {
    this.db.execute(this.sql, this.params, 'run');
    return { success: true, meta: {} } as any;
  }
}

class FakeDB {
  private users = new Map<number, UserRow>();

  constructor(users: UserRow[]) {
    for (const user of users) this.users.set(user.id, structuredClone(user));
  }

  __getUser(id: number) {
    return this.users.get(id) || null;
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(statements: Array<{ run: () => Promise<any> }>) {
    for (const statement of statements) await statement.run();
    return [];
  }

  execute(sql: string, params: any[], mode: 'first' | 'all' | 'run') {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    const getUser = (id: any) => this.users.get(Number(id)) || null;
    const cloneUser = (user: UserRow | null) => (user ? structuredClone(user) : null);

    if (
      normalized.startsWith('alter table users add column') ||
      normalized.startsWith('create table if not exists user_permissions') ||
      normalized.startsWith('create index if not exists') ||
      normalized.startsWith("update users set data_scope_type='all'") ||
      normalized.startsWith("update users set data_scope_value=null")
    ) {
      return mode === 'all' ? [] : null;
    }

    if (normalized === 'select id, username, role, is_active, must_change_password, token_version, acl_version from users where id=?') {
      const user = getUser(params[0]);
      if (!user) return null;
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        is_active: user.is_active,
        must_change_password: user.must_change_password,
        token_version: user.token_version,
        acl_version: user.acl_version,
      };
    }

    if (normalized === 'select id, username, role, is_active, must_change_password, acl_version from users where id=?') {
      const user = getUser(params[0]);
      if (!user) return null;
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        is_active: user.is_active,
        must_change_password: user.must_change_password,
        acl_version: user.acl_version,
      };
    }

    if (normalized === 'select password_hash from users where id=?') {
      const user = getUser(params[0]);
      return user ? { password_hash: user.password_hash } : null;
    }

    if (normalized === 'select token_version, username, role from users where id=?') {
      const user = getUser(params[0]);
      return user ? { token_version: user.token_version, username: user.username, role: user.role } : null;
    }

    if (normalized === 'update users set password_hash=?, must_change_password=0, token_version=token_version+1 where id=?') {
      const user = getUser(params[1]);
      if (user) {
        user.password_hash = String(params[0]);
        user.must_change_password = 0;
        user.token_version += 1;
      }
      return null;
    }

    if (normalized === 'update users set token_version=token_version+1 where id=?') {
      const user = getUser(params[0]);
      if (user) user.token_version += 1;
      return null;
    }

    if (normalized === 'select data_scope_type, data_scope_value, data_scope_value2 from users where id=?') {
      const user = getUser(params[0]);
      return user
        ? {
            data_scope_type: user.data_scope_type,
            data_scope_value: user.data_scope_value,
            data_scope_value2: user.data_scope_value2,
          }
        : null;
    }

    if (normalized === 'select id, username, role, is_active, must_change_password, permission_template_code, data_scope_type, data_scope_value, data_scope_value2 from users where id=?') {
      const user = getUser(params[0]);
      return cloneUser(user);
    }

    if (normalized === "select count(*) as c from users where role='admin' and is_active=1 and id<>?") {
      const count = Array.from(this.users.values()).filter((user) => user.role === 'admin' && user.is_active === 1 && user.id !== Number(params[0])).length;
      return { c: count };
    }

    if (normalized === 'update users set role=? where id=?') {
      const user = getUser(params[1]);
      if (user) user.role = String(params[0]) as UserRow['role'];
      return null;
    }

    if (normalized === 'update users set acl_version=coalesce(acl_version,0)+1 where id=?') {
      const user = getUser(params[0]);
      if (user) user.acl_version += 1;
      return null;
    }

    if (normalized === 'update users set is_active=? where id=?') {
      const user = getUser(params[1]);
      if (user) user.is_active = Number(params[0]);
      return null;
    }

    if (normalized === 'update users set permission_template_code=? where id=?') {
      const user = getUser(params[1]);
      if (user) user.permission_template_code = params[0] == null ? null : String(params[0]);
      return null;
    }

    if (normalized === 'update users set data_scope_type=?, data_scope_value=?, data_scope_value2=? where id=?') {
      const user = getUser(params[3]);
      if (user) {
        user.data_scope_type = params[0] == null ? null : String(params[0]);
        user.data_scope_value = params[1] == null ? null : String(params[1]);
        user.data_scope_value2 = params[2] == null ? null : String(params[2]);
      }
      return null;
    }

    if (normalized === 'select id, username, role, is_active, must_change_password, created_at, permission_template_code, data_scope_type, data_scope_value, data_scope_value2 from users where id=?') {
      const user = getUser(params[0]);
      return cloneUser(user);
    }

    if (normalized === 'select id, username, role, is_active from users where id=?') {
      const user = getUser(params[0]);
      if (!user) return null;
      return { id: user.id, username: user.username, role: user.role, is_active: user.is_active };
    }

    if (normalized === 'delete from users where id=?') {
      this.users.delete(Number(params[0]));
      return null;
    }

    throw new Error(`Unhandled SQL in test FakeDB: ${sql}`);
  }
}

type TestEnv = {
  DB: FakeDB;
  JWT_SECRET: string;
  __refresh_token?: string | null;
};

async function makeEnv(): Promise<TestEnv> {
  const adminHash = await hashPassword('Admin123', 1000);
  const aliceHash = await hashPassword('Oldpass1', 1000);
  return {
    DB: new FakeDB([
      {
        id: 1,
        username: 'admin',
        role: 'admin',
        is_active: 1,
        must_change_password: 0,
        token_version: 0,
        acl_version: 0,
        password_hash: adminHash,
        permission_template_code: 'admin_full',
        data_scope_type: 'all',
        data_scope_value: null,
        data_scope_value2: null,
        created_at: '2026-04-21 10:00:00',
      },
      {
        id: 2,
        username: 'alice',
        role: 'viewer',
        is_active: 1,
        must_change_password: 0,
        token_version: 0,
        acl_version: 0,
        password_hash: aliceHash,
        permission_template_code: 'readonly',
        data_scope_type: 'all',
        data_scope_value: null,
        data_scope_value2: null,
        created_at: '2026-04-21 10:00:00',
      },
    ]),
    JWT_SECRET: 'test-secret',
  };
}

async function issueToken(env: TestEnv, userId: number) {
  const user = env.DB.__getUser(userId)!;
  return signJwt({ sub: user.id, u: user.username, r: user.role, tv: user.token_version }, env.JWT_SECRET, 3600);
}

function makeRequest(url: string, token: string, method = 'GET', body?: unknown) {
  const headers: Record<string, string> = {
    cookie: buildAuthCookie(token, 3600),
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  invalidateCachedAuthUser();
  invalidateCachedMe();
  invalidateUserDataScopeCache();
});

describe('auth regression fixes', () => {
  it('keeps the current session usable after password change', async () => {
    const env = await makeEnv();
    const token = await issueToken(env, 2);
    const originalRequest = makeRequest('https://example.com/api/auth/change-password', token, 'POST', {
      old_password: 'Oldpass1',
      new_password: 'Newpass2',
    });

    await requireAuth(env as any, makeRequest('https://example.com/api/auth/me', token), 'viewer');

    const response = await changePasswordHandler({ env: env as any, request: originalRequest } as any);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof env.__refresh_token).toBe('string');

    const refreshedRequest = makeRequest('https://example.com/api/auth/me', String(env.__refresh_token));
    const user = await requireAuth(env as any, refreshedRequest, 'viewer');
    expect(user.id).toBe(2);
    expect(env.DB.__getUser(2)?.token_version).toBe(1);
  });

  it('invalidates the old token immediately on logout', async () => {
    const env = await makeEnv();
    const token = await issueToken(env, 2);
    const request = makeRequest('https://example.com/api/auth/logout', token, 'POST');

    await requireAuth(env as any, makeRequest('https://example.com/api/auth/me', token), 'viewer');

    const response = await logoutHandler({ env: env as any, request } as any);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);

    await expect(requireAuth(env as any, makeRequest('https://example.com/api/auth/me', token), 'viewer')).rejects.toMatchObject({ status: 401 });
  });

  it('blocks the next request immediately after an admin disables a user', async () => {
    const env = await makeEnv();
    const aliceToken = await issueToken(env, 2);
    const adminToken = await issueToken(env, 1);

    await requireAuth(env as any, makeRequest('https://example.com/api/auth/me', aliceToken), 'viewer');

    const updateResponse = await updateUserHandler({
      env: env as any,
      request: makeRequest('https://example.com/api/users', adminToken, 'PUT', { id: 2, is_active: 0 }),
    } as any);
    const updateBody = await updateResponse.json();
    expect(updateResponse.status).toBe(200);
    expect(updateBody.ok).toBe(true);
    expect(env.DB.__getUser(2)?.is_active).toBe(0);

    await expect(requireAuth(env as any, makeRequest('https://example.com/api/auth/me', aliceToken), 'viewer')).rejects.toMatchObject({ status: 403 });
  });

  it('reflects role and data scope changes immediately in /api/auth/me', async () => {
    const env = await makeEnv();
    const aliceToken = await issueToken(env, 2);
    const adminToken = await issueToken(env, 1);

    const beforeResponse = await meHandler({ env: env as any, request: makeRequest('https://example.com/api/auth/me', aliceToken) } as any);
    const beforeBody = await beforeResponse.json();
    expect(beforeBody.ok).toBe(true);
    expect(beforeBody.data.user.role).toBe('viewer');
    expect(beforeBody.data.user.data_scope_type).toBe('all');

    const updateResponse = await updateUserHandler({
      env: env as any,
      request: makeRequest('https://example.com/api/users', adminToken, 'PUT', {
        id: 2,
        role: 'operator',
        data_scope_type: 'department',
        data_scope_value: 'IT',
      }),
    } as any);
    const updateBody = await updateResponse.json();
    expect(updateResponse.status).toBe(200);
    expect(updateBody.ok).toBe(true);

    const afterResponse = await meHandler({ env: env as any, request: makeRequest('https://example.com/api/auth/me', aliceToken) } as any);
    const afterBody = await afterResponse.json();
    expect(afterBody.ok).toBe(true);
    expect(afterBody.data.user.role).toBe('operator');
    expect(afterBody.data.user.data_scope_type).toBe('department');
    expect(afterBody.data.user.data_scope_value).toBe('IT');
    expect(env.DB.__getUser(2)?.acl_version).toBeGreaterThan(0);
  });
});
