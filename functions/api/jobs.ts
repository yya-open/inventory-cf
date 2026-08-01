import { json, type AuthUser } from '../_auth';
import { withErrorHandling } from './_error';
import { requirePermission } from '../_permissions';
import { cancelAsyncJob, cleanupAsyncJobHousekeeping, createAsyncJob, createAsyncJobs, deleteAsyncJob, deleteAsyncJobs, getAsyncJob, listAsyncJobs, retryAsyncJob, assertAsyncJobAccess } from './services/async-jobs';
import { dispatchAsyncJobIds, isAsyncQueueRequired } from './services/async-job-queue';
import { getSchemaStatus } from './services/schema-status';
import { assertMonitorAssetIdsDataScopeAccess, assertPcAssetIdsDataScopeAccess, getAuthUserDataScope } from './services/data-scope';
import { logAudit } from './_audit';
import { resolveAsyncJobAuth } from './services/async-job-authz';

const QR_EXPORT_TYPES = new Set(['PC_QR_CARDS_EXPORT', 'PC_QR_SHEET_EXPORT', 'MONITOR_QR_CARDS_EXPORT', 'MONITOR_QR_SHEET_EXPORT']);
const QR_EXPORT_CHUNK_SIZE = 500;
const QR_EXPORT_NO_BUCKET_CHUNK_SIZE = 200;
const JOBS_SCHEMA_CACHE_TTL_MS = 5 * 60_000;
let jobsSchemaOkCache: { expiresAt: number; status: any } | null = null;

async function getCachedJobsSchemaStatus(db: D1Database, timing?: any) {
  const now = Date.now();
  if (jobsSchemaOkCache && jobsSchemaOkCache.expiresAt > now && jobsSchemaOkCache.status?.ok) return jobsSchemaOkCache.status;
  const status = timing?.measure
    ? await timing.measure('jobs_schema', () => getSchemaStatus(db))
    : await getSchemaStatus(db);
  if (status?.ok) jobsSchemaOkCache = { status, expiresAt: now + JOBS_SCHEMA_CACHE_TTL_MS };
  else jobsSchemaOkCache = null;
  return status;
}

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

function resolveQrExportChunkSize(hasBucket: boolean) {
  return hasBucket ? QR_EXPORT_CHUNK_SIZE : QR_EXPORT_NO_BUCKET_CHUNK_SIZE;
}

async function assertQrExportDataScope(db: D1Database, actor: AuthUser, jobType: string, ids: number[]) {
  if (!QR_EXPORT_TYPES.has(jobType) || !ids.length) return;
  const scope = getAuthUserDataScope(actor);
  if (jobType.startsWith('PC_QR_')) {
    await assertPcAssetIdsDataScopeAccess(db, scope, ids, '二维码导出');
    return;
  }
  if (jobType.startsWith('MONITOR_QR_')) {
    await assertMonitorAssetIdsDataScopeAccess(db, scope, ids, '二维码导出');
  }
}

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET?: any; ASYNC_JOB_QUEUE?: any; ASYNC_JOB_QUEUE_REQUIRED?: string | number | null }>(async ({ env, request }) => {
  const timing = (env as any).__timing;
  const actor = await requirePermission(env, request, 'async_job_manage', 'viewer');
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 100)));
  const jobStatus = (url.searchParams.get('status') || '').trim() || null;
  const jobType = (url.searchParams.get('job_type') || '').trim() || null;
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') || 7)));
  const mineOnly = ['1', 'true'].includes(String(url.searchParams.get('mine') || '').toLowerCase());
  const afterId = Math.max(0, Math.trunc(Number(url.searchParams.get('after_id') || 0)));
  // 向后翻页游标：取比它更早（id 更小）的任务。与 after_id 语义相反，同时传时以 after_id 为准。
  const beforeId = Math.max(0, Math.trunc(Number(url.searchParams.get('before_id') || 0)));
  const detail = ['1', 'true'].includes(String(url.searchParams.get('detail') || '').toLowerCase());
  const ids = String(url.searchParams.get('ids') || '')
    .split(',')
    .map((value) => Math.trunc(Number(value || 0)))
    .filter((value, index, arr) => Number.isFinite(value) && value > 0 && arr.indexOf(value) === index)
    .slice(0, 200);
  const assetScope = getAuthUserDataScope(actor);
  const data = timing?.measure
    ? await timing.measure('jobs_query', () => listAsyncJobs(env.DB, { limit, status: jobStatus, job_type: jobType, days, created_by: mineOnly ? actor.id : null, after_id: afterId || null, before_id: afterId ? null : (beforeId || null), ids, detail, skipEnsure: true, assetScope }, env.BACKUP_BUCKET))
    : await listAsyncJobs(env.DB, { limit, status: jobStatus, job_type: jobType, days, created_by: mineOnly ? actor.id : null, after_id: afterId || null, before_id: afterId ? null : (beforeId || null), ids, detail, skipEnsure: true, assetScope }, env.BACKUP_BUCKET);
  return json(true, data);
});

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET?: any; ASYNC_JOB_QUEUE?: any; ASYNC_JOB_QUEUE_REQUIRED?: string | number | null }>(async (context) => {
  const { env, request, waitUntil } = context as any;
  const { job_type, request_json, permission_scope, retain_days, max_retries } = await request.json().catch(() => ({} as any));
  const jobType = String(job_type || '');
  // job_type 决定这个任务能做什么，因此必须先过运行时白名单，再按该类型要求的权限校验。
  // 过去这里按 job_type 自行挑权限码（非 QR 导出一律 async_job_manage + viewer），
  // 等于把「校验哪个权限」的决定权交给了请求方。
  const jobAuth = resolveAsyncJobAuth(jobType);
  if (!jobAuth) return json(false, null, '不支持的任务类型', 400);
  const actor = await requirePermission(env, request, jobAuth.permission, jobAuth.minRole);
  const status = await getCachedJobsSchemaStatus(env.DB);
  if (!status.ok) return json(false, status, status.message, 409);
  if (QR_EXPORT_TYPES.has(jobType)) {
    const ids = normalizeQrExportIds(request_json?.ids);
    await assertQrExportDataScope(env.DB, actor, jobType, ids);
    const chunkSize = resolveQrExportChunkSize(!!env.BACKUP_BUCKET);
    if (ids.length > chunkSize) {
      const batchKey = `qr_export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const chunks = chunkIds(ids, chunkSize);
      const createdIds = await createAsyncJobs(env.DB, chunks.map((chunk, index) => ({
        job_type,
        created_by: actor.id,
        created_by_name: actor.username,
        permission_scope: permission_scope || null,
        request_json: { ...(request_json || {}), ids: chunk, export_batch_key: batchKey, export_batch_index: index + 1, export_batch_total: chunks.length, export_total_ids: ids.length },
        retain_days,
        max_retries,
      })));
      if (createdIds.length) {
        await dispatchAsyncJobIds({ db: env.DB, ids: createdIds, queue: env.ASYNC_JOB_QUEUE, waitUntil, bucket: env.BACKUP_BUCKET, requireQueue: isAsyncQueueRequired(env) });
      }
      await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_CREATE', 'async_jobs', `batch:${batchKey}`, { job_type, retain_days, max_retries, batch_key: batchKey, split_count: createdIds.length, total_ids: ids.length });
      return json(true, { batch: true, batch_key: batchKey, job_ids: createdIds, job_type, status: 'queued', split_count: createdIds.length, total_ids: ids.length, chunk_size: chunkSize }, `已按每 ${chunkSize} 条自动拆分为 ${createdIds.length} 个异步任务，后台将继续处理`);
    }
  }
  const id = await createAsyncJob(env.DB, { job_type, created_by: actor.id, created_by_name: actor.username, permission_scope: permission_scope || null, request_json: request_json || {}, retain_days, max_retries });
  await dispatchAsyncJobIds({ db: env.DB, ids: [id], queue: env.ASYNC_JOB_QUEUE, waitUntil, bucket: env.BACKUP_BUCKET, requireQueue: isAsyncQueueRequired(env) });
  await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_CREATE', 'async_jobs', id, { job_type, retain_days, max_retries });
  return json(true, { id, job_type, status: 'queued' }, '任务已创建，后台将继续处理');
});

export const onRequestPut = withErrorHandling<{ DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET?: any; ASYNC_JOB_QUEUE?: any; ASYNC_JOB_QUEUE_REQUIRED?: string | number | null }>(async (context) => {
  const { env, request, waitUntil } = context as any;
  const timing = (env as any).__timing;
  const actor = await requirePermission(env, request, 'async_job_manage', 'viewer');
  const scope = getAuthUserDataScope(actor);
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').trim();
  const id = Number(body?.id || 0);
  if (action === 'cleanup') {
    await requirePermission(env, request, 'async_job_manage', 'admin');
    const result = await cleanupAsyncJobHousekeeping(env.DB, env.BACKUP_BUCKET);
    await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_CLEANUP', 'async_jobs', 'housekeeping', result);
    return json(true, result, `已清理：过期结果 ${result.expired_results}，删除旧任务 ${result.purged_rows}，自动取消超时任务 ${result.auto_canceled}`);
  }
  if (action === 'cancel') {
    if (!id) return json(false, null, '缺少任务 id', 400);
    const row = await getAsyncJob(env.DB, id);
    if (!row) return json(false, null, '任务不存在', 404);
    await assertAsyncJobAccess(env.DB, row, actor, scope);
    await cancelAsyncJob(env.DB, id, env.BACKUP_BUCKET);
    await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_CANCEL', 'async_jobs', id, {});
    return json(true, { id }, '已发出取消请求');
  }
  if (action === 'retry') {
    if (!id) return json(false, null, '缺少任务 id', 400);
    const row = await getAsyncJob(env.DB, id);
    if (!row) return json(false, null, '任务不存在', 404);
    await assertAsyncJobAccess(env.DB, row, actor, scope);
    await retryAsyncJob(env.DB, id, env.BACKUP_BUCKET);
    await dispatchAsyncJobIds({ db: env.DB, ids: [id], queue: env.ASYNC_JOB_QUEUE, waitUntil, bucket: env.BACKUP_BUCKET, requireQueue: isAsyncQueueRequired(env) });
    await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_RETRY', 'async_jobs', id, {});
    return json(true, { id }, '任务已重试，后台将继续处理');
  }
  if (action === 'delete') {
    if (!id) return json(false, null, '缺少任务 id', 400);
    const row = await getAsyncJob(env.DB, id);
    if (!row) return json(false, null, '任务不存在', 404);
    await assertAsyncJobAccess(env.DB, row, actor, scope);
    await deleteAsyncJob(env.DB, id, env.BACKUP_BUCKET);
    await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_DELETE', 'async_jobs', id, {});
    return json(true, { id }, '任务已删除');
  }
  if (action === 'delete_batch') {
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((value: any) => Math.trunc(Number(value || 0))).filter((value: number, index: number, arr: number[]) => Number.isFinite(value) && value > 0 && arr.indexOf(value) === index).slice(0, 500)
      : [];
    if (!ids.length) return json(false, null, '缺少有效任务 ids', 400);
    // 逐个校验：admin 或本人。外部 id 一律 403，不静默跳过。
    const CHUNK_SIZE = 100;
    const rowMap = new Map<number, any>();
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      const { results } = await env.DB.prepare(
        `SELECT id, job_type, created_by FROM async_jobs WHERE id IN (${placeholders})`
      ).bind(...chunk).all();
      for (const row of results || []) rowMap.set(Number(row.id), row);
    }
    for (const id of ids) {
      const row = rowMap.get(id);
      if (!row) continue;
      await assertAsyncJobAccess(env.DB, row, actor, scope);
    }
    const result = timing?.measure
      ? await timing.measure('jobs_delete_batch_core', () => deleteAsyncJobs(env.DB, ids, env.BACKUP_BUCKET))
      : await deleteAsyncJobs(env.DB, ids, env.BACKUP_BUCKET);
    const auditTask = async () => {
      if (timing?.measure) {
        await timing.measure('jobs_delete_batch_audit', () => logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_DELETE_BATCH', 'async_jobs', String(ids.length), result));
      } else {
        await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_DELETE_BATCH', 'async_jobs', String(ids.length), result);
      }
    };
    if (typeof waitUntil === 'function') {
      waitUntil(auditTask().catch(() => {}));
    } else {
      void auditTask().catch(() => {});
    }
    const summary = `批量删除完成：删除 ${result.deleted} 条，跳过运行中 ${result.blocked} 条，缺失 ${result.missing} 条，失败 ${result.failed} 条`;
    return json(true, result, summary);
  }
  return json(false, null, '不支持的操作', 400);
});
