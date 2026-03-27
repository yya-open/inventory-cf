import { errorResponse, json, requireAuth } from './_auth';
import { buildAsyncJobDownloadResponse, getAsyncJob } from './services/async-jobs';
import { ensureAssetInventoryBatchSchema } from './services/asset-inventory-batches';

function parseKind(input: any) {
  const kind = String(input || '').trim().toLowerCase();
  if (kind === 'pc' || kind === 'monitor') return kind;
  throw Object.assign(new Error('kind 参数无效'), { status: 400 });
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    await ensureAssetInventoryBatchSchema(env.DB);
    const url = new URL(request.url);
    const kind = parseKind(url.searchParams.get('kind'));
    const id = Number(url.searchParams.get('id') || 0);
    if (!id) return json(false, null, 'id 无效', 400);
    const batch = await env.DB.prepare(
      `SELECT id, kind, snapshot_job_id, snapshot_job_status FROM asset_inventory_batch WHERE kind=? AND id=? LIMIT 1`
    ).bind(kind, id).first<any>();
    if (!batch?.id) return json(false, null, '盘点批次不存在', 404);
    if (!Number(batch.snapshot_job_id || 0)) return json(false, null, '该批次暂无可下载结果快照', 404);
    const row = await getAsyncJob(env.DB, Number(batch.snapshot_job_id));
    if (!row) return json(false, null, '结果快照任务不存在', 404);
    const inline = ['1', 'true'].includes(String(url.searchParams.get('inline') || '').toLowerCase());
    return buildAsyncJobDownloadResponse(row, { inline, print: false });
  } catch (e: any) {
    return errorResponse(e);
  }
};
