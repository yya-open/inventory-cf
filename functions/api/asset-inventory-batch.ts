import { errorResponse } from './_auth';
import { apiFail, apiOk } from './_response';
import { logAudit } from './_audit';
import { requireCapability } from '../_capabilities';
import { type AssetInventoryKind } from './services/asset-inventory-batches';
import { closeInventoryBatchWorkflow, getInventoryBatchDomainSnapshot, startInventoryBatchWorkflow } from './services/asset-inventory-domain';
import { dispatchAsyncJobIds } from './services/async-job-queue';

function parseKind(input: any): AssetInventoryKind {
  const kind = String(input || '').trim().toLowerCase();
  if (kind === 'pc' || kind === 'monitor') return kind;
  throw Object.assign(new Error('kind 参数无效'), { status: 400 });
}

type Env = { DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET?: any; ASYNC_JOB_QUEUE?: any };

const INVENTORY_BATCH_CACHE_TTL_MS = 5 * 60_000;
const inventoryBatchGetCache = new Map<string, { expiresAt: number; data: any }>();

function inventoryBatchCacheKey(kind: AssetInventoryKind) {
  return `batch:${kind}`;
}

function readInventoryBatchCache(kind: AssetInventoryKind) {
  const entry = inventoryBatchGetCache.get(inventoryBatchCacheKey(kind));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    inventoryBatchGetCache.delete(inventoryBatchCacheKey(kind));
    return null;
  }
  return entry.data;
}

function writeInventoryBatchCache(kind: AssetInventoryKind, data: any) {
  inventoryBatchGetCache.set(inventoryBatchCacheKey(kind), { expiresAt: Date.now() + INVENTORY_BATCH_CACHE_TTL_MS, data });
  return data;
}

function invalidateInventoryBatchCache(kind?: AssetInventoryKind | null) {
  if (kind) {
    inventoryBatchGetCache.delete(inventoryBatchCacheKey(kind));
    return;
  }
  inventoryBatchGetCache.clear();
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    await requireCapability(env, request, 'inventory.view');
    if (!env.DB) return apiFail('未绑定 D1 数据库(DB)', { status: 500 });
    const url = new URL(request.url);
    const kind = parseKind(url.searchParams.get('kind'));
    const cached = readInventoryBatchCache(kind);
    if (cached) return apiOk(cached);
    const payload = writeInventoryBatchCache(kind, await getInventoryBatchDomainSnapshot(env.DB, kind));
    return apiOk(payload);
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireCapability(env, request, 'inventory.manage');
    if (!env.DB) return apiFail('未绑定 D1 数据库(DB)', { status: 500 });
    const body: any = await request.json().catch(() => ({}));
    const kind = parseKind(body?.kind);
    const action = String(body?.action || '').trim().toLowerCase();

    if (action === 'start') {
      invalidateInventoryBatchCache(kind);
      const clearPreviousLogs = Boolean(body?.clear_previous_logs);
      const { batch, deletedLogs } = await startInventoryBatchWorkflow(env.DB, kind, actor.username || null, { name: body?.name, clearPreviousLogs });
      await logAudit(env.DB, request, actor, 'ASSET_INVENTORY_BATCH_START', 'asset_inventory_batch', batch?.id || null, {
        kind,
        name: batch?.name || null,
        clear_previous_logs: clearPreviousLogs,
        cleared_logs: deletedLogs,
      }).catch(() => {});
      return apiOk(batch, { message: `${kind === 'pc' ? '电脑' : '显示器'}盘点批次已开启`, meta: { cleanup: { deleted: deletedLogs } } });
    }

    if (action === 'close') {
      invalidateInventoryBatchCache(kind);
      if (!env.BACKUP_BUCKET) return apiFail('未绑定 R2：BACKUP_BUCKET。请先在 Cloudflare 里绑定 R2 Bucket。', { status: 500 });
      const workflow = await closeInventoryBatchWorkflow(env.DB, kind, { id: actor.id, username: actor.username }, env.BACKUP_BUCKET, { batchId: Number(body?.id || body?.batch_id || 0) || null });
      if (workflow.reused) {
        return apiOk(workflow.batch, {
          message: workflow.existingStatus === 'success'
            ? `${kind === 'pc' ? '电脑' : '显示器'}盘点批次已结束，结果快照已可下载`
            : `${kind === 'pc' ? '电脑' : '显示器'}盘点批次已结束，正在复用已有结果快照任务`,
          meta: { snapshot_job_id: workflow.existingJobId, reused: true },
        });
      }
      invalidateInventoryBatchCache(kind);
      await dispatchAsyncJobIds({ db: env.DB, ids: [workflow.existingJobId], queue: env.ASYNC_JOB_QUEUE, waitUntil, bucket: env.BACKUP_BUCKET });
      await logAudit(env.DB, request, actor, 'ASSET_INVENTORY_BATCH_CLOSE', 'asset_inventory_batch', workflow.targetBatchId, {
        kind,
        batch_id: workflow.targetBatchId,
        snapshot_job_id: workflow.existingJobId,
      }).catch(() => {});
      return apiOk(workflow.batch, { message: `${kind === 'pc' ? '电脑' : '显示器'}盘点批次已结束，结果快照正在后台生成`, meta: { snapshot_job_id: workflow.existingJobId } });
    }

    return apiFail('action 参数无效', { status: 400 });
  } catch (e: any) {
    return errorResponse(e);
  }
};
