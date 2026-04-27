import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';
import { cancelAsyncJob, cleanupAsyncJobHousekeeping, createAsyncJob, deleteAsyncJob, deleteAsyncJobs, listAsyncJobs, retryAsyncJob } from './services/async-jobs';
import { dispatchAsyncJobIds } from './services/async-job-queue';
import { getSchemaStatus } from './services/schema-status';
import { logAudit } from './_audit';

const QR_EXPORT_TYPES = new Set(['PC_QR_CARDS_EXPORT', 'PC_QR_SHEET_EXPORT', 'MONITOR_QR_CARDS_EXPORT', 'MONITOR_QR_SHEET_EXPORT']);
const QR_EXPORT_CHUNK_SIZE = 500;

function normalizeQrExportIds(input: any) {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const value of Array.isArray(input) ? input : []) {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) continue;
    const normalized = Math.trunc(id);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    ids.push(normalized);
  }
  return ids;
}

function chunkIds(ids: number[], size = QR_EXPORT_CHUNK_SIZE) {
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET?: any; ASYNC_JOB_QUEUE?: any }> = async ({ env, request }) => {
  try {
    const timing = (env as any).__timing;
    const actor = await requirePermission(env, request, 'async_job_manage', 'viewer');
    const status = timing?.measure
      ? await timing.measure('jobs_schema', () => getSchemaStatus(env.DB))
      : await getSchemaStatus(env.DB);
    if (!status.ok) return json(false, status, status.message, 409);
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 100)));
    const jobStatus = (url.searchParams.get('status') || '').trim() || null;
    const jobType = (url.searchParams.get('job_type') || '').trim() || null;
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') || 7)));
    const mineOnly = ['1', 'true'].includes(String(url.searchParams.get('mine') || '').toLowerCase());
    const afterId = Math.max(0, Math.trunc(Number(url.searchParams.get('after_id') || 0)));
    const ids = String(url.searchParams.get('ids') || '')
      .split(',')
      .map((value) => Math.trunc(Number(value || 0)))
      .filter((value, index, arr) => Number.isFinite(value) && value > 0 && arr.indexOf(value) === index)
      .slice(0, 200);
    const data = timing?.measure
      ? await timing.measure('jobs_query', () => listAsyncJobs(env.DB, { limit, status: jobStatus, job_type: jobType, days, created_by: mineOnly ? actor.id : null, after_id: afterId || null, ids }, env.BACKUP_BUCKET))
      : await listAsyncJobs(env.DB, { limit, status: jobStatus, job_type: jobType, days, created_by: mineOnly ? actor.id : null, after_id: afterId || null, ids }, env.BACKUP_BUCKET);
    return json(true, data);
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET?: any; ASYNC_JOB_QUEUE?: any }> = async (context) => {
  const { env, request, waitUntil } = context as any;
  try {
    const actor = await requirePermission(env, request, 'async_job_manage', 'viewer');
    const status = await getSchemaStatus(env.DB);
    if (!status.ok) return json(false, status, status.message, 409);
    const { job_type, request_json, permission_scope, retain_days, max_retries } = await request.json<any>();
    if (QR_EXPORT_TYPES.has(String(job_type || ''))) {
      const ids = normalizeQrExportIds(request_json?.ids);
      if (ids.length > QR_EXPORT_CHUNK_SIZE) {
        const batchKey = `qr_export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const chunks = chunkIds(ids);
        const createdIds: number[] = [];
        for (let index = 0; index < chunks.length; index += 1) {
          const chunkRequest = { ...(request_json || {}), ids: chunks[index], export_batch_key: batchKey, export_batch_index: index + 1, export_batch_total: chunks.length, export_total_ids: ids.length };
          const id = await createAsyncJob(env.DB, { job_type, created_by: actor.id, created_by_name: actor.username, permission_scope: permission_scope || null, request_json: chunkRequest, retain_days, max_retries }, env.BACKUP_BUCKET);
          createdIds.push(id);
        }
        if (createdIds.length) {
          await dispatchAsyncJobIds({ db: env.DB, ids: createdIds, queue: env.ASYNC_JOB_QUEUE, waitUntil, bucket: env.BACKUP_BUCKET });
        }
        await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_CREATE', 'async_jobs', `batch:${batchKey}`, { job_type, retain_days, max_retries, batch_key: batchKey, split_count: createdIds.length, total_ids: ids.length });
        return json(true, { batch: true, batch_key: batchKey, job_ids: createdIds, job_type, status: 'queued', split_count: createdIds.length, total_ids: ids.length }, `已按每 500 条自动拆分为 ${createdIds.length} 个异步任务，后台将继续处理`);
      }
    }
    const id = await createAsyncJob(env.DB, { job_type, created_by: actor.id, created_by_name: actor.username, permission_scope: permission_scope || null, request_json: request_json || {}, retain_days, max_retries }, env.BACKUP_BUCKET);
    await dispatchAsyncJobIds({ db: env.DB, ids: [id], queue: env.ASYNC_JOB_QUEUE, waitUntil, bucket: env.BACKUP_BUCKET });
    await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_CREATE', 'async_jobs', id, { job_type, retain_days, max_retries });
    return json(true, { id, job_type, status: 'queued' }, '任务已创建，后台将继续处理');
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPut: PagesFunction<{ DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET?: any; ASYNC_JOB_QUEUE?: any }> = async (context) => {
  const { env, request, waitUntil } = context as any;
  try {
    const actor = await requirePermission(env, request, 'async_job_manage', 'viewer');
    const body = await request.json<any>().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const id = Number(body?.id || 0);
    if (action === 'cleanup') {
      const result = await cleanupAsyncJobHousekeeping(env.DB, env.BACKUP_BUCKET);
      await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_CLEANUP', 'async_jobs', 'housekeeping', result);
      return json(true, result, `已清理：过期结果 ${result.expired_results}，删除旧任务 ${result.purged_rows}，自动取消超时任务 ${result.auto_canceled}`);
    }
    if (action === 'cancel') {
      if (!id) return json(false, null, '缺少任务 id', 400);
      await cancelAsyncJob(env.DB, id, env.BACKUP_BUCKET);
      await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_CANCEL', 'async_jobs', id, {});
      return json(true, { id }, '已发出取消请求');
    }
    if (action === 'retry') {
      if (!id) return json(false, null, '缺少任务 id', 400);
      await retryAsyncJob(env.DB, id, env.BACKUP_BUCKET);
      await dispatchAsyncJobIds({ db: env.DB, ids: [id], queue: env.ASYNC_JOB_QUEUE, waitUntil, bucket: env.BACKUP_BUCKET });
      await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_RETRY', 'async_jobs', id, {});
      return json(true, { id }, '任务已重试，后台将继续处理');
    }
    if (action === 'delete') {
      if (!id) return json(false, null, '缺少任务 id', 400);
      await deleteAsyncJob(env.DB, id, env.BACKUP_BUCKET);
      await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_DELETE', 'async_jobs', id, {});
      return json(true, { id }, '任务已删除');
    }
    if (action === 'delete_batch') {
      const ids = Array.isArray(body?.ids)
        ? body.ids.map((value: any) => Math.trunc(Number(value || 0))).filter((value: number, index: number, arr: number[]) => Number.isFinite(value) && value > 0 && arr.indexOf(value) === index).slice(0, 500)
        : [];
      if (!ids.length) return json(false, null, '缺少有效任务 ids', 400);
      const result = await deleteAsyncJobs(env.DB, ids, env.BACKUP_BUCKET);
      await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_DELETE_BATCH', 'async_jobs', String(ids.length), result);
      const summary = `批量删除完成：删除 ${result.deleted} 条，跳过运行中 ${result.blocked} 条，缺失 ${result.missing} 条，失败 ${result.failed} 条`;
      return json(true, result, summary);
    }
    return json(false, null, '不支持的操作', 400);
  } catch (e: any) {
    return errorResponse(e);
  }
};
