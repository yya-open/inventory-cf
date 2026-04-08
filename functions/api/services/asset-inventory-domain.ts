import { attachInventoryBatchSnapshotJob, clearInventoryLogsForNewBatch, closeInventoryBatch, getActiveInventoryBatch, getLatestInventoryBatch, listRecentInventoryBatches, startInventoryBatch, type AssetInventoryKind } from './asset-inventory-batches';
import { createAsyncJob } from './async-jobs';

export async function getInventoryBatchDomainSnapshot(db: D1Database, kind: AssetInventoryKind) {
  const [latest, recent] = await Promise.all([
    getLatestInventoryBatch(db, kind),
    listRecentInventoryBatches(db, kind, 5),
  ]);
  const resolvedActive = String(latest?.status || '').toUpperCase() === 'ACTIVE' ? latest : null;
  const resolvedLatest = latest || resolvedActive;
  const resolvedRecent = (recent || []).filter((item) => !resolvedActive || Number(item?.id || 0) !== Number(resolvedActive?.id || 0));
  return { active: resolvedActive, latest: resolvedLatest, recent: resolvedRecent };
}

export async function startInventoryBatchWorkflow(db: D1Database, kind: AssetInventoryKind, actorName: string | null, options: { name?: string | null; clearPreviousLogs?: boolean }) {
  const deletedLogs = options.clearPreviousLogs ? await clearInventoryLogsForNewBatch(db, kind) : 0;
  const batch = await startInventoryBatch(db, kind, options.name, actorName);
  return { batch, deletedLogs };
}

export async function closeInventoryBatchWorkflow(db: D1Database, kind: AssetInventoryKind, actor: { id: number; username: string }, bucket: any, options?: { batchId?: number | null }) {
  const batchId = Number(options?.batchId || 0) || null;
  const before = batchId ? null : await getActiveInventoryBatch(db, kind);
  const batch = await closeInventoryBatch(db, kind, actor.username || null, batchId);
  const targetBatchId = Number(batch?.id || batchId || before?.id || 0);
  if (!targetBatchId) throw Object.assign(new Error('盘点批次不存在'), { status: 404 });
  const existingJobId = Number(batch?.snapshot_job_id || 0);
  const existingStatus = String(batch?.snapshot_job_status || '').toLowerCase();
  if (existingJobId > 0 && ['queued', 'running', 'success'].includes(existingStatus)) {
    return { batch, targetBatchId, existingJobId, existingStatus, reused: true as const };
  }
  const jobId = await createAsyncJob(db, {
    job_type: 'ASSET_INVENTORY_BATCH_SNAPSHOT_EXPORT',
    created_by: actor.id,
    created_by_name: actor.username,
    permission_scope: 'viewer',
    retain_days: 30,
    max_retries: 2,
    request_json: { kind, batch_id: targetBatchId },
  }, bucket);
  const attached = await attachInventoryBatchSnapshotJob(db, kind, targetBatchId, jobId);
  return { batch: attached, targetBatchId, existingJobId: jobId, existingStatus: 'queued', reused: false as const };
}
