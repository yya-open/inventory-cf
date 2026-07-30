import { beforeEach, describe, expect, it, vi } from 'vitest';

// Every cron job the consumer schedules is mocked so the test observes only what `scheduled`
// hands to ctx.waitUntil. Each mock returns a fresh, identifiable promise (tracked in `pending`)
// so we can assert the exact promise instance reached waitUntil.
const jobs = vi.hoisted(() => ({
  cleanupAsyncJobHousekeeping: vi.fn(),
  processAsyncJob: vi.fn(),
  runAuditCleanupIfDue: vi.fn(),
  refreshAuditStorageStats: vi.fn(),
  maybeRunAuditArchiveMaintenance: vi.fn(),
  refreshDirtySystemDictionaryUsageCounters: vi.fn(),
  runObservabilityCleanup: vi.fn(),
}));

vi.mock('../functions/api/services/async-jobs', () => ({
  cleanupAsyncJobHousekeeping: jobs.cleanupAsyncJobHousekeeping,
  processAsyncJob: jobs.processAsyncJob,
}));

vi.mock('../functions/api/_audit', () => ({
  runAuditCleanupIfDue: jobs.runAuditCleanupIfDue,
  refreshAuditStorageStats: jobs.refreshAuditStorageStats,
}));

vi.mock('../functions/api/services/audit-archive', () => ({
  maybeRunAuditArchiveMaintenance: jobs.maybeRunAuditArchiveMaintenance,
}));

vi.mock('../functions/api/services/system-dictionaries', () => ({
  refreshDirtySystemDictionaryUsageCounters: jobs.refreshDirtySystemDictionaryUsageCounters,
}));

vi.mock('../functions/api/services/observability', () => ({
  runObservabilityCleanup: jobs.runObservabilityCleanup,
}));

const pending = new Map<string, Promise<string>>();

// The consumer only forwards env.DB / env.BACKUP_BUCKET to the (mocked) jobs, so opaque handles suffice.
const db = { __brand: 'fake-d1' } as unknown as D1Database;
const bucket = { __brand: 'fake-r2' };

beforeEach(() => {
  vi.clearAllMocks();
  pending.clear();
  for (const [name, fn] of Object.entries(jobs)) {
    fn.mockImplementation(() => {
      const promise = Promise.resolve(name);
      pending.set(name, promise);
      return promise;
    });
  }
});

async function loadConsumer() {
  vi.resetModules();
  const module = await import('../workers/async-jobs-consumer');
  return module.default;
}

function makeCtx() {
  const waitUntil = vi.fn((_promise: Promise<unknown>) => {});
  const ctx = { waitUntil, passThroughOnException: () => {} } as unknown as ExecutionContext;
  return { ctx, waitUntil };
}

describe('async-jobs consumer scheduled handler', () => {
  it('schedules the observability retention cleanup alongside the other cron jobs', async () => {
    const consumer = await loadConsumer();
    const { ctx, waitUntil } = makeCtx();

    await consumer.scheduled({} as unknown as ScheduledController, { DB: db, BACKUP_BUCKET: bucket }, ctx);

    expect(jobs.runObservabilityCleanup).toHaveBeenCalledTimes(1);
    expect(jobs.runObservabilityCleanup).toHaveBeenCalledWith(db, { reason: 'cron' });

    const scheduledPromises = waitUntil.mock.calls.map((call) => call[0]);
    expect(scheduledPromises).toContain(pending.get('runObservabilityCleanup'));
    expect(scheduledPromises).toEqual([
      pending.get('cleanupAsyncJobHousekeeping'),
      pending.get('runAuditCleanupIfDue'),
      pending.get('refreshAuditStorageStats'),
      pending.get('maybeRunAuditArchiveMaintenance'),
      pending.get('refreshDirtySystemDictionaryUsageCounters'),
      pending.get('runObservabilityCleanup'),
    ]);

    expect(jobs.cleanupAsyncJobHousekeeping).toHaveBeenCalledWith(db, bucket);
    expect(jobs.runAuditCleanupIfDue).toHaveBeenCalledWith(db);
    expect(jobs.refreshAuditStorageStats).toHaveBeenCalledWith(db);
    expect(jobs.maybeRunAuditArchiveMaintenance).toHaveBeenCalledWith(db, bucket);
    expect(jobs.refreshDirtySystemDictionaryUsageCounters).toHaveBeenCalledWith(db);
  });

  it('keeps the queue handler free of retention work', async () => {
    const consumer = await loadConsumer();

    const ack = vi.fn();
    await consumer.queue({ messages: [{ id: 'm1', body: { job_id: 42 }, ack }] }, { DB: db, BACKUP_BUCKET: bucket });

    expect(jobs.processAsyncJob).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(jobs.runObservabilityCleanup).not.toHaveBeenCalled();
  });
});
