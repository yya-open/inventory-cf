import { describe, expect, it, vi } from 'vitest';

vi.mock('../functions/_auth', async () => {
  const actual = await vi.importActual<any>('../functions/_auth');
  return {
    ...actual,
    requireAuth: vi.fn(async () => ({ id: 1, username: 'admin', role: 'admin', is_active: 1 })),
  };
});

import { onRequestGet as usersGetHandler } from '../functions/api/users';

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
    return { success: true } as any;
  }
}

class FakeDB {
  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
  execute(sql: string, params: any[], mode: 'first' | 'all' | 'run') {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('create table if not exists user_permissions') || normalized.startsWith('alter table users add column')) {
      return mode === 'all' ? [] : null;
    }
    if (normalized.startsWith('select count(*) as c from users')) return { c: 1 };
    if (normalized.startsWith('select id, username, role, is_active, must_change_password, created_at, permission_template_code')) {
      return [{
        id: 2,
        username: 'alice',
        role: 'viewer',
        is_active: 1,
        must_change_password: 0,
        created_at: '2026-04-28 00:00:00',
        permission_template_code: 'readonly',
        data_scope_type: 'all',
        data_scope_value: null,
        data_scope_value2: null,
      }];
    }
    if (normalized.startsWith('select user_id, permission_code, allowed from user_permissions where user_id in')) {
      return [{ user_id: 2, permission_code: 'audit_export', allowed: 1 }];
    }
    throw new Error(`Unhandled SQL: ${sql} | params=${JSON.stringify(params)}`);
  }
}

describe('/api/users view mode', () => {
  it('returns lite by default and full when requested', async () => {
    const env = { DB: new FakeDB(), JWT_SECRET: 'test' } as any;

    const liteResp = await usersGetHandler({ env, request: new Request('https://example.com/api/users') } as any);
    const liteBody = await liteResp.json();
    expect(liteResp.status).toBe(200);
    expect(liteBody.ok).toBe(true);
    expect(liteBody.data[0].permission_overrides).toEqual({ audit_export: true });
    expect(liteBody.data[0].permission_override_count).toBe(1);
    expect(liteBody.data[0].permissions).toBeUndefined();

    const fullResp = await usersGetHandler({ env, request: new Request('https://example.com/api/users?view=full') } as any);
    const fullBody = await fullResp.json();
    expect(fullResp.status).toBe(200);
    expect(fullBody.ok).toBe(true);
    expect(fullBody.data[0].permissions).toBeTruthy();
    expect(fullBody.data[0].permissions.audit_export).toBe(true);
  });
});
