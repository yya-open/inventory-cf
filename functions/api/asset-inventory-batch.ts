import { errorResponse, requireAuth } from './_auth';
import { logAudit } from './_audit';
import { clearInventoryLogsForNewBatch, closeInventoryBatch, getActiveInventoryBatch, getLatestInventoryBatch, listRecentInventoryBatches, startInventoryBatch, attachInventoryBatchSnapshotJob, type AssetInventoryKind } from './services/asset-inventory-batches';
import { createAsyncJob, processAsyncJobIds } from './services/async-jobs';

function parseKind(input: any): AssetInventoryKind {
  const kind = String(input || '').trim().toLowerCase();
  if (kind === 'pc' || kind === 'monitor') return kind;
  throw Object.assign(new Error('kind 参数无效'), { status: 400 });
}

type Env = { DB: D1Database; JWT_SECRET: string };

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    const url = new URL(request.url);
    const kind = parseKind(url.searchParams.get('kind'));
    const [active, latest, recent] = await Promise.all([
      getActiveInventoryBatch(env.DB, kind),
      getLatestInventoryBatch(env.DB, kind),
      listRecentInventoryBatches(env.DB, kind, 1),
    ]);
    return Response.json({ ok: true, data: { active, latest, recent } });
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, 'admin');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    const body: any = await request.json().catch(() => ({}));
    const kind = parseKind(body?.kind);
    const action = String(body?.action || '').trim().toLowerCase();

    if (action === 'start') {
      const clearPreviousLogs = Boolean(body?.clear_previous_logs);
      const deletedLogs = clearPreviousLogs ? await clearInventoryLogsForNewBatch(env.DB, kind) : 0;
      const batch = await startInventoryBatch(env.DB, kind, body?.name, actor.username || null);
      await logAudit(env.DB, request, actor, 'ASSET_INVENTORY_BATCH_START', 'asset_inventory_batch', batch?.id || null, {
        kind,
        name: batch?.name || null,
        clear_previous_logs: clearPreviousLogs,
        cleared_logs: deletedLogs,
      }).catch(() => {});
      return Response.json({ ok: true, data: batch, cleanup: { deleted: deletedLogs }, message: `${kind === 'pc' ? '电脑' : '显示器'}盘点批次已开启` });
    }

    if (action === 'close') {
      const batchId = Number(body?.id || 0) || null;
      const before = batchId ? null : await getActiveInventoryBatch(env.DB, kind);
      const batch = await closeInventoryBatch(env.DB, kind, actor.username || null, batchId);
      const targetBatchId = Number(batch?.id || batchId || before?.id || 0);
      if (!targetBatchId) return Response.json({ ok: false, message: '盘点批次不存在' }, { status: 404 });
      const jobId = await createAsyncJob(env.DB, {
        job_type: 'ASSET_INVENTORY_BATCH_SNAPSHOT_EXPORT',
        created_by: actor.id,
        created_by_name: actor.username,
        permission_scope: 'viewer',
        retain_days: 30,
        max_retries: 2,
        request_json: {
          kind,
          batch_id: targetBatchId,
        },
      });
      const attached = await attachInventoryBatchSnapshotJob(env.DB, kind, targetBatchId, jobId);
      if (typeof waitUntil === 'function') waitUntil(processAsyncJobIds(env.DB, [jobId]));
      else void processAsyncJobIds(env.DB, [jobId]);
      await logAudit(env.DB, request, actor, 'ASSET_INVENTORY_BATCH_CLOSE', 'asset_inventory_batch', targetBatchId, {
        kind,
        batch_id: targetBatchId,
        snapshot_job_id: jobId,
      }).catch(() => {});
      return Response.json({ ok: true, data: attached, snapshot_job_id: jobId, message: `${kind === 'pc' ? '电脑' : '显示器'}盘点批次已结束，结果快照正在后台生成` });
    }

    return Response.json({ ok: false, message: 'action 参数无效' }, { status: 400 });
  } catch (e: any) {
    return errorResponse(e);
  }
};
