import { describe, expect, it, vi } from 'vitest';

const bulkUpdatePcStatus = vi.fn(async () => ({ changed: 1, skipped: 0, ids: [100], skippedIds: [] }));
const bulkUpdateMonitorStatus = vi.fn(async () => ({ changed: 1, skipped: 0, ids: [200], skippedIds: [] }));

vi.mock('../functions/_permissions', () => ({
  requirePermission: vi.fn(async () => ({ id: 7, username: 'limited', role: 'operator' })),
}));

vi.mock('../functions/api/services/asset-bulk', () => ({
  bulkArchiveAssets: vi.fn(),
  bulkRestoreAssets: vi.fn(),
  bulkUpdateMonitorLocation: vi.fn(),
  bulkUpdateMonitorOwner: vi.fn(),
  bulkUpdateMonitorStatus,
  bulkUpdatePcOwner: vi.fn(),
  bulkUpdatePcStatus,
  loadAssetRows: vi.fn(),
}));

const { onRequestPost: pcBulkHandler } = await import('../functions/api/pc-assets-bulk');
const { onRequestPost: monitorBulkHandler } = await import('../functions/api/monitor-assets-bulk');

class FakeStatement {
  private params: any[] = [];

  constructor(private db: FakeDB, private sql: string) {}

  bind(...params: any[]) {
    this.params = params;
    return this;
  }

  async first<T = any>() {
    return this.db.first(this.sql, this.params) as T;
  }

  async all<T = any>() {
    return { results: this.db.all(this.sql, this.params) as T[] };
  }
}

class FakeDB {
  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(_statements: any[]) {
    return [{ results: [{ c: 3 }] }, { results: [{ ok: 1 }] }];
  }

  first(sql: string, params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('select data_scope_type, data_scope_value, data_scope_value2 from users where id=')) {
      return { data_scope_type: 'department', data_scope_value: 'Finance', data_scope_value2: null };
    }
    throw new Error(`Unhandled first SQL: ${sql} / ${JSON.stringify(params)}`);
  }

  all(sql: string, _params: any[]) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.startsWith('select a.id, s.current_department from pc_assets')) {
      return [{ id: 100, current_department: 'HR' }];
    }
    if (normalized.startsWith('select id, department from monitor_assets')) {
      return [{ id: 200, department: 'HR' }];
    }
    throw new Error(`Unhandled all SQL: ${sql}`);
  }
}

function makeRequest(path: string, body: any) {
  return new Request(`https://example.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('asset bulk data scope guards', () => {
  it('blocks PC bulk operations outside the actor department', async () => {
    bulkUpdatePcStatus.mockClear();
    const response = await pcBulkHandler({
      env: { DB: new FakeDB(), JWT_SECRET: 'test' },
      request: makeRequest('/api/pc-assets-bulk', { action: 'status', ids: [100], status: 'IN_STOCK' }),
      waitUntil: vi.fn(),
    } as any);

    expect(response.status).toBe(403);
    expect(bulkUpdatePcStatus).not.toHaveBeenCalled();
  });

  it('blocks monitor bulk operations outside the actor department', async () => {
    bulkUpdateMonitorStatus.mockClear();
    const response = await monitorBulkHandler({
      env: { DB: new FakeDB(), JWT_SECRET: 'test' },
      request: makeRequest('/api/monitor-assets-bulk', { action: 'status', ids: [200], status: 'IN_STOCK' }),
      waitUntil: vi.fn(),
    } as any);

    expect(response.status).toBe(403);
    expect(bulkUpdateMonitorStatus).not.toHaveBeenCalled();
  });
});
