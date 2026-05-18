import { describe, expect, it, vi } from 'vitest';

const createdJobs = vi.hoisted(() => ({ requests: [] as any[] }));

vi.mock('../functions/_permissions', () => ({
  requirePermission: vi.fn(async () => ({ id: 7, username: 'operator', role: 'operator' })),
}));

vi.mock('../functions/api/services/schema-status', () => ({
  getSchemaStatus: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../functions/api/services/data-scope', () => ({
  getUserDataScope: vi.fn(async () => ({ data_scope_type: 'all', data_scope_value: null, data_scope_value2: null })),
  assertPcAssetIdsDataScopeAccess: vi.fn(async () => {}),
  assertMonitorAssetIdsDataScopeAccess: vi.fn(async () => {}),
}));

vi.mock('../functions/api/services/async-job-queue', () => ({
  dispatchAsyncJobIds: vi.fn(async () => ({ enqueued: 1, mode: 'inline' })),
}));

vi.mock('../functions/api/_audit', () => ({
  logAudit: vi.fn(async () => {}),
}));

vi.mock('../functions/api/services/async-jobs', () => ({
  createAsyncJobs: vi.fn(async (_db: any, inputs: any[]) => {
    const ids: number[] = [];
    for (const input of inputs) {
      createdJobs.requests.push(input.request_json);
      ids.push(createdJobs.requests.length);
    }
    return ids;
  }),
  createAsyncJob: vi.fn(async (_db: any, input: any) => {
    createdJobs.requests.push(input.request_json);
    return createdJobs.requests.length;
  }),
  cancelAsyncJob: vi.fn(async () => {}),
  cleanupAsyncJobHousekeeping: vi.fn(async () => ({})),
  deleteAsyncJob: vi.fn(async () => {}),
  deleteAsyncJobs: vi.fn(async () => ({})),
  listAsyncJobs: vi.fn(async () => []),
  retryAsyncJob: vi.fn(async () => {}),
}));

import { requirePermission } from '../functions/_permissions';
import { onRequestPost as jobsPostHandler } from '../functions/api/jobs';

describe('/api/jobs QR export batching', () => {
  it('uses qr_export permission and smaller chunks without object storage', async () => {
    createdJobs.requests = [];
    const ids = Array.from({ length: 450 }, (_item, index) => index + 1);
    const request = new Request('https://example.test/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        job_type: 'PC_QR_CARDS_EXPORT',
        request_json: { ids, origin: 'https://example.test' },
        retain_days: 7,
        max_retries: 1,
      }),
    });

    const response = await jobsPostHandler({ env: { DB: {} }, request, waitUntil: vi.fn() } as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.split_count).toBe(3);
    expect(body.data.chunk_size).toBe(200);
    expect(createdJobs.requests.map((item) => item.ids.length)).toEqual([200, 200, 50]);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'qr_export', 'viewer');
  });
});
