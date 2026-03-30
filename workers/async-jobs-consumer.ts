import { cleanupAsyncJobHousekeeping, processAsyncJob } from '../functions/api/services/async-jobs';
import { refreshDirtySystemDictionaryUsageCounters } from '../functions/api/services/system-dictionaries';

type QueueMessage<T> = {
  id?: string;
  body: T;
  ack?: () => void;
  retry?: () => void;
};

type MessageBatch<T> = {
  messages: Array<QueueMessage<T>>;
};

type Env = {
  DB: D1Database;
  BACKUP_BUCKET?: any;
};

type AsyncJobQueuePayload = {
  job_id?: number;
};

async function handleJobMessage(env: Env, message: QueueMessage<AsyncJobQueuePayload>) {
  const jobId = Math.trunc(Number(message?.body?.job_id || 0));
  if (!Number.isFinite(jobId) || jobId <= 0) {
    message?.ack?.();
    return;
  }
  try {
    await processAsyncJob(env.DB, jobId, env.BACKUP_BUCKET);
    message?.ack?.();
  } catch (error) {
    console.error('async-job-consumer processAsyncJob failed', { jobId, error: String((error as any)?.message || error) });
    message?.retry?.();
  }
}

export default {
  async queue(batch: MessageBatch<AsyncJobQueuePayload>, env: Env) {
    for (const message of batch.messages || []) {
      await handleJobMessage(env, message);
    }
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanupAsyncJobHousekeeping(env.DB, env.BACKUP_BUCKET));
    ctx.waitUntil(refreshDirtySystemDictionaryUsageCounters(env.DB));
  },
};
