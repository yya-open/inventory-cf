import { describe, expect, it } from 'vitest';
import { buildAuthCookie, requireAuth, signJwt } from '../functions/_auth';

const AVAILABLE_COLUMNS = [
  'id',
  'username',
  'role',
  'is_active',
  'must_change_password',
  'token_version',
  'acl_version',
  'data_scope_type',
  'data_scope_value',
  'data_scope_value2',
];

class PartialSchemaStatement {
  private params: unknown[] = [];

  constructor(private readonly sql: string) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async first<T = unknown>() {
    const normalized = this.sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('permission_template_code')) {
      throw new Error('D1_ERROR: no such column: permission_template_code');
    }
    if (normalized.startsWith('select id, username, role, is_active') && Number(this.params[0]) === 7) {
      return {
        id: 7,
        username: 'limited',
        role: 'operator',
        is_active: 1,
        must_change_password: 0,
        token_version: 0,
        acl_version: 3,
        data_scope_type: 'department',
        data_scope_value: 'Finance',
        data_scope_value2: null,
      } as T;
    }
    throw new Error(`Unexpected first SQL: ${normalized}`);
  }

  async all<T = unknown>() {
    const normalized = this.sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized !== "select name from pragma_table_info('users')") {
      throw new Error(`Unexpected all SQL: ${normalized}`);
    }
    return { results: AVAILABLE_COLUMNS.map((name) => ({ name })) as T[] };
  }
}

class PartialSchemaDB {
  prepare(sql: string) {
    return new PartialSchemaStatement(sql);
  }
}

describe('authentication with a partially migrated users table', () => {
  it('preserves existing data-scope fields when another optional column is missing', async () => {
    const secret = 'partial-schema-secret';
    const token = await signJwt({ sub: 7, u: 'limited', r: 'operator', tv: 0 }, secret, 3600);
    const request = new Request('https://example.test/api/items', {
      headers: { cookie: buildAuthCookie(token, 3600) },
    });

    const user = await requireAuth({ DB: new PartialSchemaDB() as any, JWT_SECRET: secret }, request, 'viewer');

    expect(user).toMatchObject({
      id: 7,
      role: 'operator',
      acl_version: 3,
      permission_template_code: null,
      data_scope_type: 'department',
      data_scope_value: 'Finance',
      data_scope_value2: null,
    });
  });
});
