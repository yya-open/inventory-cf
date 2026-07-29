import { describe, expect, it, vi } from 'vitest';

const processed = vi.hoisted(() => ({ calls: [] as number[][] }));

vi.mock('../functions/api/services/async-jobs', () => ({
  processAsyncJobIds: vi.fn(async (_db: any, ids: number[]) => {
    processed.calls.push(ids);
  }),
}));

import { dispatchAsyncJobIds, isAsyncQueueRequired } from '../functions/api/services/async-job-queue';
import { processAsyncJobIds } from '../functions/api/services/async-jobs';

describe('isAsyncQueueRequired', () => {
  it('is true only for explicit 1/true flags', () => {
    expect(isAsyncQueueRequired({ ASYNC_JOB_QUEUE_REQUIRED: '1' })).toBe(true);
    expect(isAsyncQueueRequired({ ASYNC_JOB_QUEUE_REQUIRED: 'true' })).toBe(true);
    expect(isAsyncQueueRequired({ ASYNC_JOB_QUEUE_REQUIRED: 'TRUE' })).toBe(true);
    expect(isAsyncQueueRequired({ ASYNC_JOB_QUEUE_REQUIRED: '0' })).toBe(false);
    expect(isAsyncQueueRequired({ ASYNC_JOB_QUEUE_REQUIRED: '' })).toBe(false);
    expect(isAsyncQueueRequired({})).toBe(false);
    expect(isAsyncQueueRequired()).toBe(false);
  });
});

describe('dispatchAsyncJobIds queue-required contract', () => {
  it('throws 503 instead of inline fallback when queue is required but unbound', async () => {
    processed.calls = [];
    const waitUntil = vi.fn();

    await expect(
      dispatchAsyncJobIds({ db: {} as any, ids: [5], requireQueue: true, waitUntil }),
    ).rejects.toMatchObject({ status: 503 });

    expect(processed.calls).toEqual([]);
    expect(waitUntil).not.toHaveBeenCalled();
    expect(processAsyncJobIds).not.toHaveBeenCalled();
  });

  it('enqueues to the bound queue even when required', async () => {
    processed.calls = [];
    const send = vi.fn(async () => {});
    const result = await dispatchAsyncJobIds({
      db: {} as any,
      ids: [9],
      requireQueue: true,
      queue: { send } as any,
    });

    expect(result).toEqual({ enqueued: 1, mode: 'queue' });
    expect(send).toHaveBeenCalledWith({ job_id: 9 });
    expect(processed.calls).toEqual([]);
  });

  it('falls back to inline processing when not required and unbound', async () => {
    processed.calls = [];
    const waitUntil = vi.fn((promise: Promise<unknown>) => promise);
    const result = await dispatchAsyncJobIds({ db: {} as any, ids: [3, 4], waitUntil });

    expect(result).toEqual({ enqueued: 2, mode: 'inline' });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(processed.calls).toEqual([[3, 4]]);
  });

  it('short-circuits with no ids regardless of the required flag', async () => {
    processed.calls = [];
    const result = await dispatchAsyncJobIds({ db: {} as any, ids: [], requireQueue: true });

    expect(result).toEqual({ enqueued: 0, mode: 'none' });
    expect(processed.calls).toEqual([]);
  });
});
