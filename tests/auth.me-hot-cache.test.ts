import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../functions/_permissions', () => {
  const KNOWN_TEMPLATE_CODES = ['admin_full', 'admin_ops', 'operator_plus', 'auditor', 'readonly'];
  return {
    normalizePermissionTemplateCode: vi.fn((role: string | null | undefined, templateCode: string | null | undefined) => {
      if (KNOWN_TEMPLATE_CODES.includes(String(templateCode || ''))) return String(templateCode);
      if (role === 'admin') return 'admin_full';
      if (role === 'operator') return 'operator_plus';
      return 'readonly';
    }),
    getUserPermissionMap: vi.fn(async (_db: unknown, _userId: number, role: string | null | undefined) => ({
      qr_export: role === 'admin' || role === 'operator',
      bulk_operation: role === 'admin',
    })),
  };
});

vi.mock('../functions/api/services/data-scope', () => ({
  getAuthUserDataScope: vi.fn(() => ({
    data_scope_type: 'all',
    data_scope_value: null,
    data_scope_value2: null,
  })),
}));

import { buildAuthCookie, signJwt } from '../functions/_auth';
import { getUserPermissionMap } from '../functions/_permissions';
import { getAuthUserDataScope } from '../functions/api/services/data-scope';
import { invalidateCachedMe, onRequestGet as meHandler } from '../functions/api/auth/me';

const SECRET = 'me-hot-cache-secret';
/** Mirrors ME_HOT_CACHE_WRITE_DEBOUNCE_MS in functions/api/auth/me.ts (not exported). */
const WRITE_DEBOUNCE_MS = 160;
const USERS_SELECT_SQL =
  'select id, username, role, is_active, must_change_password, token_version, acl_version, permission_template_code, data_scope_type, data_scope_value, data_scope_value2 from users where id=?';
const HOT_CACHE_SELECT_SQL = 'select payload_json, acl_version from me_hot_cache where user_id=?';

type FakeUser = {
  id: number;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  is_active: number;
  must_change_password: number;
  token_version: number;
  acl_version: number;
  permission_template_code: string | null;
  data_scope_type: string | null;
  data_scope_value: string | null;
  data_scope_value2: string | null;
};

type HotCacheRow = { payload_json: string | null; acl_version: number };
type HotCacheWrite = { userId: number; payloadJson: string; aclVersion: number; sql: string };

type MeUser = {
  id?: number;
  username?: string;
  role?: string;
  acl_version?: number;
  permission_template_code?: string;
  permissions?: Record<string, boolean>;
  data_scope_type?: string;
  origin?: string;
};

type MeBody = { ok: boolean; data: { user: MeUser } | null; message?: string | null };

class FakeMeStatement {
  private params: unknown[] = [];

  constructor(private readonly db: FakeMeDb, private readonly sql: string) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async first() {
    return this.db.selectFirst(this.sql, this.params);
  }

  async run() {
    this.db.write(this.sql, this.params);
    return { success: true, meta: {} };
  }
}

class FakeMeDb {
  hotCacheRow: HotCacheRow | null = null;
  hotCacheReadFails = false;
  readonly hotCacheSelects: number[] = [];
  readonly hotCacheWrites: HotCacheWrite[] = [];

  constructor(private readonly user: FakeUser) {}

  prepare(sql: string) {
    return new FakeMeStatement(this, sql);
  }

  selectFirst(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized === USERS_SELECT_SQL) {
      return Number(params[0]) === this.user.id ? { ...this.user } : null;
    }
    if (normalized === HOT_CACHE_SELECT_SQL) {
      this.hotCacheSelects.push(Number(params[0]));
      if (this.hotCacheReadFails) throw new Error('D1_ERROR: me_hot_cache is unavailable');
      return this.hotCacheRow ? { ...this.hotCacheRow } : null;
    }
    throw new Error(`Unexpected read SQL in me_hot_cache fake: ${normalized}`);
  }

  write(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('insert into me_hot_cache')) {
      this.hotCacheWrites.push({
        userId: Number(params[0]),
        payloadJson: String(params[1]),
        aclVersion: Number(params[2]),
        sql: normalized,
      });
      return;
    }
    throw new Error(`Unexpected write SQL in me_hot_cache fake: ${normalized}`);
  }
}

function makeUser(id: number, username: string, aclVersion: number): FakeUser {
  return {
    id,
    username,
    role: 'operator',
    is_active: 1,
    must_change_password: 0,
    token_version: 0,
    acl_version: aclVersion,
    permission_template_code: 'operator_plus',
    data_scope_type: 'all',
    data_scope_value: null,
    data_scope_value2: null,
  };
}

type MeEnv = { DB: D1Database; JWT_SECRET: string };
type MeContext = EventContext<MeEnv>;

function makeEnv(user: FakeUser) {
  const fake = new FakeMeDb(user);
  // The fake only implements the D1 surface /api/auth/me + requireAuth touch: prepare/bind/first/run.
  const db = fake as unknown as D1Database;
  const env: MeEnv = { DB: db, JWT_SECRET: SECRET };
  return { fake, env };
}

async function callMe(env: MeEnv, token: string) {
  const request = new Request('https://example.test/api/auth/me', {
    headers: { cookie: buildAuthCookie(token, 3600) },
  });
  const response = await meHandler({ env, request } as unknown as MeContext);
  const body: MeBody = await response.json();
  return { status: response.status, body };
}

beforeEach(async () => {
  vi.useFakeTimers();
  await invalidateCachedMe();
});

afterEach(async () => {
  await invalidateCachedMe();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('/api/auth/me me_hot_cache path', () => {
  it('serves a matching hot-cache row without rebuilding permissions or data scope', async () => {
    const user = makeUser(101, 'hot-hit', 5);
    const { fake, env } = makeEnv(user);
    fake.hotCacheRow = {
      payload_json: JSON.stringify({
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          acl_version: 5,
          permission_template_code: 'auditor',
          permissions: { qr_export: false, bulk_operation: false },
          data_scope_type: 'all',
          origin: 'hot_cache_row',
        },
      }),
      acl_version: 5,
    };
    const token = await signJwt({ sub: user.id, u: user.username, r: user.role, tv: 0 }, SECRET, 3600);

    const first = await callMe(env, token);

    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(first.body.data?.user.origin).toBe('hot_cache_row');
    expect(first.body.data?.user.permission_template_code).toBe('auditor');
    expect(first.body.data?.user.permissions).toEqual({ qr_export: false, bulk_operation: false });
    // The rebuild collaborators must stay untouched on a hot hit.
    expect(vi.mocked(getUserPermissionMap)).not.toHaveBeenCalled();
    expect(vi.mocked(getAuthUserDataScope)).not.toHaveBeenCalled();
    expect(fake.hotCacheWrites).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);

    const second = await callMe(env, token);

    expect(second.body.data?.user.origin).toBe('hot_cache_row');
    expect(fake.hotCacheSelects).toEqual([user.id]);
    expect(vi.mocked(getUserPermissionMap)).not.toHaveBeenCalled();
  });

  it('ignores a stale acl_version row, rebuilds, and persists the fresh payload after the write debounce', async () => {
    const user = makeUser(102, 'version-mismatch', 7);
    const { fake, env } = makeEnv(user);
    // Stored acl_version 6 is stale for a user now at acl_version 7.
    fake.hotCacheRow = {
      payload_json: JSON.stringify({
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          acl_version: 6,
          permission_template_code: 'auditor',
          permissions: { qr_export: false, bulk_operation: false },
          data_scope_type: 'all',
          origin: 'hot_cache_row',
        },
      }),
      acl_version: 6,
    };
    const token = await signJwt({ sub: user.id, u: user.username, r: user.role, tv: 0 }, SECRET, 3600);

    const { status, body } = await callMe(env, token);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.user.origin).toBeUndefined();
    expect(body.data?.user.acl_version).toBe(7);
    expect(body.data?.user.permission_template_code).toBe('operator_plus');
    expect(body.data?.user.permissions).toEqual({ qr_export: true, bulk_operation: false });
    expect(vi.mocked(getUserPermissionMap)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getUserPermissionMap)).toHaveBeenCalledWith(env.DB, user.id, 'operator', 'operator_plus');

    expect(fake.hotCacheWrites).toEqual([]);
    await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS - 1);
    expect(fake.hotCacheWrites).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(fake.hotCacheWrites).toHaveLength(1);
    const write = fake.hotCacheWrites[0];
    expect(write.userId).toBe(user.id);
    expect(write.aclVersion).toBe(7);
    expect(write.sql).toContain('on conflict(user_id) do update');
    const persisted: { user: MeUser } = JSON.parse(write.payloadJson);
    expect(persisted.user.username).toBe('version-mismatch');
    expect(persisted.user.acl_version).toBe(7);
    expect(persisted.user.permissions).toEqual({ qr_export: true, bulk_operation: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { label: 'missing', userId: 103, row: null },
    { label: 'non-JSON', userId: 104, row: { payload_json: '{not-json', acl_version: 4 } },
    { label: 'a payload without user', userId: 105, row: { payload_json: JSON.stringify({ acl: {} }), acl_version: 4 } },
  ])('rebuilds and re-primes the hot cache when the row is $label', async ({ userId, row }) => {
    const user = makeUser(userId, `unusable-${userId}`, 4);
    const { fake, env } = makeEnv(user);
    fake.hotCacheRow = row;
    const token = await signJwt({ sub: user.id, u: user.username, r: user.role, tv: 0 }, SECRET, 3600);

    const { status, body } = await callMe(env, token);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.user.username).toBe(`unusable-${userId}`);
    expect(body.data?.user.acl_version).toBe(4);
    expect(body.data?.user.permissions).toEqual({ qr_export: true, bulk_operation: false });
    expect(fake.hotCacheSelects).toEqual([userId]);
    expect(vi.mocked(getUserPermissionMap)).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);

    expect(fake.hotCacheWrites).toHaveLength(1);
    expect(fake.hotCacheWrites[0]).toMatchObject({ userId, aclVersion: 4 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still answers ok when the hot-cache SELECT rejects', async () => {
    const user = makeUser(106, 'd1-read-failure', 9);
    const { fake, env } = makeEnv(user);
    fake.hotCacheReadFails = true;
    const token = await signJwt({ sub: user.id, u: user.username, r: user.role, tv: 0 }, SECRET, 3600);

    const { status, body } = await callMe(env, token);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.message).toBeFalsy();
    expect(body.data?.user.username).toBe('d1-read-failure');
    expect(body.data?.user.acl_version).toBe(9);
    expect(fake.hotCacheSelects).toEqual([user.id]);
    expect(vi.mocked(getUserPermissionMap)).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS);

    expect(fake.hotCacheWrites).toHaveLength(1);
    expect(fake.hotCacheWrites[0]).toMatchObject({ userId: user.id, aclVersion: 9 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
