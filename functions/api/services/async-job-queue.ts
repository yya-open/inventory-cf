import { processAsyncJobIds } from './async-jobs';

type QueueMessageBody = { job_id: number };

type QueueSendResult = { ok?: boolean; error?: unknown };

type AsyncJobQueueBinding = {
  send: (body: QueueMessageBody) => Promise<void>;
  sendBatch?: (messages: Array<{ body: QueueMessageBody }>) => Promise<QueueSendResult[] | void>;
};

type DispatchOptions = {
  db: D1Database;
  ids: number[];
  queue?: AsyncJobQueueBinding | null;
  waitUntil?: ((promise: Promise<unknown>) => void) | null;
  bucket?: any;
};

function normalizeIds(ids: number[]) {
  return Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((value) => Math.trunc(Number(value || 0)))
    .filter((value) => Number.isFinite(value) && value > 0)));
}

export async function enqueueAsyncJobIds(queue: AsyncJobQueueBinding | null | undefined, ids: number[]) {
  const normalized = normalizeIds(ids);
  if (!queue || !normalized.length) return { enqueued: 0, mode: 'none' as const };
  if (typeof queue.sendBatch === 'function' && normalized.length > 1) {
    const results = await queue.sendBatch(normalized.map((jobId) => ({ body: { job_id: jobId } })));
    if (Array.isArray(results)) {
      const failed = results.find((item) => item && item.ok === false);
      if (failed) throw new Error(`队列入队失败：${String((failed as any).error || 'unknown')}`);
    }
    return { enqueued: normalized.length, mode: 'queue' as const };
  }
  for (const jobId of normalized) await queue.send({ job_id: jobId });
  return { enqueued: normalized.length, mode: 'queue' as const };
}

export async function dispatchAsyncJobIds(options: DispatchOptions) {
  const normalized = normalizeIds(options.ids);
  if (!normalized.length) return { enqueued: 0, mode: 'none' as const };
  if (options.queue) return enqueueAsyncJobIds(options.queue, normalized);
  const runner = processAsyncJobIds(options.db, normalized, options.bucket);
  if (typeof options.waitUntil === 'function') options.waitUntil(runner);
  else void runner;
  return { enqueued: normalized.length, mode: 'inline' as const };
}
