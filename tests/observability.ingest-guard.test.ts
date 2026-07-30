import { describe, expect, it, vi } from 'vitest';
import { buildAuthCookie, signJwt } from '../functions/_auth';

const SECRET = 'observability-ingest-secret';

type IngestUser = {
  id: number;
  username: string;
  role: 'viewer' | 'operator' | 'admin';
  is_active: number;
  must_change_password: number;
  token_version: number;
  acl_version: number;
  permission_template_code: string | null;
  data_scope_type: string | null;
  data_scope_value: string | null;
  data_scope_value2: string | null;
};

type Recorded = { sql: string; params: unknown[] };

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

class FakeIngestStatement {
  params: unknown[] = [];

  constructor(readonly sql: string, private readonly db: FakeIngestDb) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async first() {
    this.db.record(this);
    return this.db.firstFor(this.sql);
  }

  async all() {
    this.db.record(this);
    return { success: true, results: [] };
  }

  async run() {
    this.db.record(this);
    return { success: true, meta: {} };
  }
}

class FakeIngestDb {
  /** every SQL string that reached the database, in order */
  readonly statements: Recorded[] = [];

  constructor(private readonly user: IngestUser | null, private readonly schemaReady = true) {}

  prepare(sql: string) {
    return new FakeIngestStatement(sql, this);
  }

  async batch(statements: FakeIngestStatement[]) {
    return statements.map((statement) => {
      this.record(statement);
      const ready = this.schemaReady ? 1 : 0;
      const results = statement.sql.includes('sqlite_master') ? [{ ok: ready }] : [];
      return { success: true, meta: {}, results };
    });
  }

  record(statement: FakeIngestStatement) {
    this.statements.push({ sql: statement.sql, params: statement.params });
  }

  firstFor(sql: string) {
    if (/FROM users WHERE id=\?$/.test(normalizeSql(sql))) return this.user;
    throw new Error(`Unexpected first() SQL: ${normalizeSql(sql)}`);
  }

  /** schema-mutating statements: any of these on the ingest path is the regression we guard against */
  get ddlStatements(): string[] {
    return this.statements.filter((item) => item.sql.includes('CREATE ') || item.sql.includes('ALTER ')).map((item) => item.sql);
  }

  get inserts(): Recorded[] {
    return this.statements.filter((item) => normalizeSql(item.sql).startsWith('INSERT INTO'));
  }
}

type IngestEnv = { DB: D1Database; JWT_SECRET?: string };
type IngestContext = EventContext<IngestEnv>;

function makeViewer(): IngestUser {
  return {
    id: 77,
    username: 'obs-viewer',
    role: 'viewer',
    is_active: 1,
    must_change_password: 0,
    token_version: 4,
    acl_version: 1,
    permission_template_code: 'readonly',
    data_scope_type: 'all',
    data_scope_value: null,
    data_scope_value2: null,
  };
}

// observability.ts caches browser-table readiness at module level, so every case reloads the
// endpoint (and the service behind it) to keep this file order-insensitive.
async function loadHandler() {
  vi.resetModules();
  // Runtime import is required: the readiness cache must be fresh per case.
  const module = await import('../functions/api/browser-performance');
  return module.onRequestPost;
}

async function postSamples(env: IngestEnv, samples: unknown[], cookie?: string) {
  const handler = await loadHandler();
  const request = new Request('https://example.test/api/browser-performance', {
    method: 'POST',
    headers: cookie ? { 'content-type': 'application/json', cookie } : { 'content-type': 'application/json' },
    body: JSON.stringify({ samples }),
  });
  const response = await handler({ env, request } as unknown as IngestContext);
  const body = (await response.json()) as { ok: boolean; data: { inserted?: number } | null; message?: string | null };
  return { status: response.status, body };
}

const ROUTE_SAMPLE = { kind: 'route', path: '/assets', fullPath: '/assets?page=2', duration_ms: 1450 };
const EVENT_SAMPLE = { kind: 'event', path: '/assets', fullPath: '/assets', event_name: 'export_click', metadata: { rows: 12 } };

describe('/api/browser-performance ingest guard', () => {
  it('rejects an anonymous POST before any statement reaches D1', async () => {
    const fake = new FakeIngestDb(makeViewer());
    // The fake only implements the D1 surface the endpoint + requireAuth touch: prepare/bind/first/all/run/batch.
    const env: IngestEnv = { DB: fake as unknown as D1Database, JWT_SECRET: SECRET };

    const { status, body } = await postSamples(env, [ROUTE_SAMPLE, EVENT_SAMPLE]);

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(fake.statements).toEqual([]);
  });

  it('rejects a POST carrying a token signed with the wrong secret', async () => {
    const fake = new FakeIngestDb(makeViewer());
    const env: IngestEnv = { DB: fake as unknown as D1Database, JWT_SECRET: SECRET };
    const token = await signJwt({ sub: 77, u: 'obs-viewer', r: 'viewer', tv: 4 }, 'other-secret', 3600);

    const { status, body } = await postSamples(env, [ROUTE_SAMPLE], buildAuthCookie(token, 3600));

    expect(status).toBe(401);
    expect(body.ok).toBe(false);
    expect(fake.statements).toEqual([]);
  });

  it('ingests samples for a signed-in viewer without emitting any DDL', async () => {
    const user = makeViewer();
    const fake = new FakeIngestDb(user);
    const env: IngestEnv = { DB: fake as unknown as D1Database, JWT_SECRET: SECRET };
    const token = await signJwt({ sub: user.id, u: user.username, r: user.role, tv: user.token_version }, SECRET, 3600);

    const { status, body } = await postSamples(env, [ROUTE_SAMPLE, EVENT_SAMPLE], buildAuthCookie(token, 3600));

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.inserted).toBe(2);
    expect(fake.ddlStatements).toEqual([]);

    const probes = fake.statements.filter((item) => item.sql.includes('sqlite_master'));
    expect(probes).toHaveLength(4);
    expect(probes.every((item) => normalizeSql(item.sql).startsWith('SELECT 1 AS ok FROM sqlite_master'))).toBe(true);

    const inserts = fake.inserts;
    expect(inserts).toHaveLength(2);
    expect(normalizeSql(inserts[0].sql)).toContain('INSERT INTO browser_perf_log');
    expect(inserts[0].params).toEqual(['route', '/assets', '/assets?page=2', 1450, user.username]);
    expect(normalizeSql(inserts[1].sql)).toContain('INSERT INTO browser_event_log');
    expect(inserts[1].params).toEqual(['export_click', '/assets', '/assets', JSON.stringify({ rows: 12 }), user.username]);
  });

  it('still ingests without DDL when the readiness probe reports missing objects', async () => {
    const user = makeViewer();
    const fake = new FakeIngestDb(user, false);
    const env: IngestEnv = { DB: fake as unknown as D1Database, JWT_SECRET: SECRET };
    const token = await signJwt({ sub: user.id, u: user.username, r: user.role, tv: user.token_version }, SECRET, 3600);

    const { status, body } = await postSamples(env, [ROUTE_SAMPLE], buildAuthCookie(token, 3600));

    expect(status).toBe(200);
    expect(body.data?.inserted).toBe(1);
    expect(fake.ddlStatements).toEqual([]);
  });

  it('caps a signed-in flood at 20 rows and drops invalid samples', async () => {
    const user = makeViewer();
    const fake = new FakeIngestDb(user);
    const env: IngestEnv = { DB: fake as unknown as D1Database, JWT_SECRET: SECRET };
    const token = await signJwt({ sub: user.id, u: user.username, r: user.role, tv: user.token_version }, SECRET, 3600);
    const flood = [
      ...Array.from({ length: 25 }, () => ROUTE_SAMPLE),
      { kind: 'route', path: '/bad', duration_ms: 0 },
    ];

    const { body } = await postSamples(env, flood, buildAuthCookie(token, 3600));

    expect(body.data?.inserted).toBe(20);
    expect(fake.inserts).toHaveLength(20);
    expect(fake.ddlStatements).toEqual([]);
  });
});
