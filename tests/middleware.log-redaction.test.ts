import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/_middleware';
import { buildLogPath } from '../functions/utils/log-path';
import { errorResponse } from '../functions/_auth';

type LoggedRow = { table: string; method: string; path: string; status: number };

class FakeStatement {
  private params: unknown[] = [];

  constructor(private db: FakeDB, private sql: string) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  async run() {
    this.db.record(this.sql, this.params);
    return { success: true, meta: { changes: 1 } };
  }
}

class FakeDB {
  readonly rows: LoggedRow[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  record(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    const table = normalized.startsWith('insert into slow_request_log')
      ? 'slow_request_log'
      : normalized.startsWith('insert into request_error_log')
        ? 'request_error_log'
        : null;
    if (!table) throw new Error(`Unhandled SQL: ${sql}`);
    this.rows.push({ table, method: String(params[0]), path: String(params[1]), status: Number(params[2]) });
  }
}

async function runMiddleware(url: string, status: number) {
  const db = new FakeDB();
  const env = { DB: db as unknown as D1Database, SLOW_REQUEST_MS: -1 };
  const res = await onRequest({
    request: new Request(url),
    env,
    next: async () => new Response(JSON.stringify({ ok: status < 500 }), { status }),
  } as unknown as Parameters<typeof onRequest>[0]);
  return { res, rows: db.rows };
}

describe('ops request log redaction', () => {
  it('masks qr credentials before writing slow and error request logs', async () => {
    const { res, rows } = await runMiddleware(
      'https://example.com/api/public/pc-asset?id=42&key=secret-qr-key&token=eyJhbGciOi.payload.sig',
      500,
    );

    expect(res.status).toBe(500);
    expect(rows.map((row) => row.table).sort()).toEqual(['request_error_log', 'slow_request_log']);
    for (const row of rows) {
      expect(row.path).toBe('/api/public/pc-asset?id=42&key=***&token=***');
      expect(row.path).not.toContain('secret-qr-key');
      expect(row.path).not.toContain('eyJhbGciOi');
    }
  });

  it('keeps non-sensitive query strings intact', async () => {
    const { rows } = await runMiddleware('https://example.com/api/pc-assets?page=2&keyword=dell', 200);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ table: 'slow_request_log', path: '/api/pc-assets?page=2&keyword=dell' });
  });

  it('masks sensitive keys case-insensitively and leaves bare paths untouched', () => {
    expect(buildLogPath(new URL('https://example.com/api/public/monitor-asset?TOKEN=abc'))).toBe(
      '/api/public/monitor-asset?TOKEN=***',
    );
    expect(buildLogPath(new URL('https://example.com/api/health'))).toBe('/api/health');
    expect(buildLogPath(new URL('https://example.com/api/health?'))).toBe('/api/health');
  });
});

describe('server error response redaction', () => {
  it('hides driver text from unannotated failures', async () => {
    const res = errorResponse(new Error('D1_ERROR: no such column: qr_key at offset 42'));
    const body = await res.json<{ ok: boolean; message: string; error_code?: string }>();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.message).toBe('服务异常');
    expect(JSON.stringify(body)).not.toContain('D1_ERROR');
  });

  it('preserves messages and codes that routes set deliberately', async () => {
    const res = errorResponse(Object.assign(new Error('电脑不存在或已删除'), { status: 404, error_code: 'PC_NOT_FOUND' }));
    const body = await res.json<{ message: string; error_code?: string }>();

    expect(res.status).toBe(404);
    expect(body.message).toBe('电脑不存在或已删除');
    expect(body.error_code).toBe('PC_NOT_FOUND');
  });
});
