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
import { listAsyncJobs } from '../functions/api/services/async-jobs';

class FakeStmt {
  private params: any[] = [];
  constructor(private db: FakeDB, private sql: string) {}
  bind(...params: any[]) { this.params = params; return this; }
  async first<T = any>() { return this.db.first(this.sql, this.params) as T; }
  async all<T = any>() { return { results: this.db.all(this.sql, this.params) as T[] }; }
  async run() { return { success: true } as any; }
}

class FakeDB {
  prepare(sql: string) { return new FakeStmt(this, sql); }
  async batch(stmts: FakeStmt[]) {
    return stmts.map((stmt: any, index) => {
      const sql = String(stmt?.sql || '').toLowerCase();
      if (sql.includes("pragma_table_info('users')")) return { results: [{ c: 3 }], success: true };
      if (sql.includes('sqlite_master') && sql.includes('idx_users_data_scope_type_value_v2')) return { results: [{ ok: 1 }], success: true };
      return { results: index === 0 ? [{ c: 3 }] : [{ ok: 1 }], success: true };
    });
  }
  first(sql: string, _params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('select data_scope_type, data_scope_value, data_scope_value2 from users where id=')) {
      return { data_scope_type: 'all', data_scope_value: null, data_scope_value2: null };
    }
    throw new Error(`Unhandled first SQL: ${sql}`);
  }
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

function snapshotJobRow(id: number, kind: 'pc' | 'monitor', batchId: number) {
  return {
    id,
    job_type: 'ASSET_INVENTORY_BATCH_SNAPSHOT_EXPORT',
    status: 'success',
    created_by_name: 'admin',
    asset_kind: kind,
    inventory_batch_id: batchId,
    message: 'ok',
    result_filename: `snapshot-${id}.xlsx`,
    result_content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
  };
}

class AssetLinkBatchFakeDB {
  pcIssueQueries = 0;
  monitorIssueQueries = 0;

  prepare(sql: string) { return new FakeStmt(this as any, sql); }

  first(sql: string, _params: any[]) {
    throw new Error(`Unhandled first SQL: ${sql}`);
  }

  all(sql: string, _params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('from async_jobs')) {
      return [
        snapshotJobRow(12, 'pc', 101),
        snapshotJobRow(11, 'pc', 102),
        snapshotJobRow(10, 'monitor', 201),
      ];
    }
    if (normalized.includes('from pc_assets a')) {
      this.pcIssueQueries += 1;
      return [
        { inventory_batch_id: 101, id: 501, serial_no: 'PC-501', brand: 'Dell', model: 'X1', inventory_issue_type: 'MISSING', issue_count: 3 },
        { inventory_batch_id: 102, id: 502, serial_no: 'PC-502', brand: 'HP', model: 'X2', inventory_issue_type: 'LOCATION', issue_count: 1 },
      ];
    }
    if (normalized.includes('from monitor_assets a')) {
      this.monitorIssueQueries += 1;
      return [
        { inventory_batch_id: 201, id: 601, asset_code: 'MON-601', sn: 'SN-601', brand: 'Dell', model: 'U27', inventory_issue_type: 'MISSING', issue_count: 2 },
      ];
    }
    throw new Error(`Unhandled SQL: ${sql}`);
  }
}

describe('/api/jobs asset link batching', () => {
  it('loads failed asset links in one query per asset kind instead of per job row', async () => {
    const db = new AssetLinkBatchFakeDB();
    const rows = await listAsyncJobs(db as any, {
      limit: 10,
      skipEnsure: true,
      assetScope: { data_scope_type: 'all', data_scope_value: null, data_scope_value2: null },
    });

    expect(rows).toHaveLength(3);
    expect(db.pcIssueQueries).toBe(1);
    expect(db.monitorIssueQueries).toBe(1);
    expect(rows.map((row: any) => row.asset_link?.failed_asset_id)).toEqual([501, 502, 601]);
    expect(rows.map((row: any) => row.asset_link?.failed_asset_count)).toEqual([3, 1, 2]);
  });
});
