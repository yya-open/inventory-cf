import { describe, expect, it, vi } from 'vitest';

vi.mock('../functions/_permissions', () => ({
  requirePermission: vi.fn(async () => ({ id: 1, username: 'admin', role: 'admin' })),
}));

vi.mock('../functions/api/services/schema-status', () => ({
  getSchemaStatus: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../functions/api/services/async-job-queue', () => ({ dispatchAsyncJobIds: vi.fn(async () => {}) }));
vi.mock('../functions/api/_audit', () => ({ logAudit: vi.fn(async () => {}) }));

import { onRequestGet as jobsGetHandler } from '../functions/api/jobs';

class FakeStmt {
  private params: any[] = [];
  constructor(private db: FakeDB, private sql: string) {}
  bind(...params: any[]) { this.params = params; return this; }
  async all<T = any>() { return { results: this.db.all(this.sql, this.params) as T[] }; }
  async run() { return { success: true } as any; }
}

class FakeDB {
  prepare(sql: string) { return new FakeStmt(this, sql); }
  all(sql: string, _params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('create table if not exists async_jobs')) return [];
    if (normalized.startsWith('alter table async_jobs add column')) return [];
    if (normalized.startsWith('create index if not exists')) return [];
    if (normalized.includes('from async_jobs') && normalized.includes('request_json')) {
      return [{
        id: 1,
        job_type: 'DASHBOARD_PRECOMPUTE',
        status: 'success',
        created_by: 1,
        created_by_name: 'admin',
        permission_scope: null,
        request_json: '{"force":true}',
        message: 'ok',
        error_text: null,
        result_filename: 'r.txt',
        result_content_type: 'text/plain',
        result_file_size: 12,
        started_at: '2026-01-01 00:00:00',
        finished_at: '2026-01-01 00:00:02',
        created_at: '2026-01-01 00:00:00',
        updated_at: '2026-01-01 00:00:02',
        retry_count: 0,
        max_retries: 1,
        cancel_requested: 0,
        retain_until: null,
        result_deleted_at: null,
        canceled_at: null,
        result_available: 1,
        result_blob_base64_len: 0,
        result_text_len: 2,
      }];
    }
    if (normalized.includes('from async_jobs')) {
      return [{
        id: 1,
        job_type: 'DASHBOARD_PRECOMPUTE',
        status: 'success',
        created_by_name: 'admin',
        message: 'ok',
        result_filename: 'r.txt',
        result_content_type: 'text/plain',
        result_file_size: 12,
        started_at: '2026-01-01 00:00:00',
        finished_at: '2026-01-01 00:00:02',
        created_at: '2026-01-01 00:00:00',
        updated_at: '2026-01-01 00:00:02',
        retry_count: 0,
        max_retries: 1,
        retain_until: null,
        result_deleted_at: null,
        canceled_at: null,
        result_available: 1,
        result_blob_base64_len: 0,
        result_text_len: 2,
      }];
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  }
}

describe('/api/jobs detail mode', () => {
  it('returns slim list by default and includes request_json in detail mode', async () => {
    const env = { DB: new FakeDB(), JWT_SECRET: 'test' } as any;

    const listResp = await jobsGetHandler({ env, request: new Request('https://example.com/api/jobs?limit=1') } as any);
    const listBody = await listResp.json();
    expect(listResp.status).toBe(200);
    expect(listBody.ok).toBe(true);
    expect(listBody.data[0].created_by).toBeUndefined();
    expect(listBody.data[0].request_json).toBeUndefined();

    const detailResp = await jobsGetHandler({ env, request: new Request('https://example.com/api/jobs?limit=1&detail=1') } as any);
    const detailBody = await detailResp.json();
    expect(detailResp.status).toBe(200);
    expect(detailBody.ok).toBe(true);
    expect(detailBody.data[0].created_by).toBe(1);
    expect(detailBody.data[0].request_json).toBe('{"force":true}');
  });
});
