import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';
import { cancelAsyncJob, cleanupExpiredAsyncJobResults, createAsyncJob, listAsyncJobs, processAsyncJob, retryAsyncJob } from './services/async-jobs';
import { getSchemaStatus } from './services/schema-status';
import { logAudit } from './_audit';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requirePermission(env, request, 'async_job_manage', 'admin');
    const status = await getSchemaStatus(env.DB);
    if (!status.ok) return json(false, status, status.message, 409);
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 100)));
    const jobStatus = (url.searchParams.get('status') || '').trim() || null;
    const jobType = (url.searchParams.get('job_type') || '').trim() || null;
    const mineOnly = ['1', 'true'].includes(String(url.searchParams.get('mine') || '').toLowerCase());
    return json(true, await listAsyncJobs(env.DB, { limit, status: jobStatus, job_type: jobType, created_by: mineOnly ? actor.id : null }));
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async (context) => {
  const { env, request, waitUntil } = context as any;
  try {
    const actor = await requirePermission(env, request, 'async_job_manage', 'admin');
    const status = await getSchemaStatus(env.DB);
    if (!status.ok) return json(false, status, status.message, 409);
    const { job_type, request_json, permission_scope, retain_days, max_retries } = await request.json<any>();
    const id = await createAsyncJob(env.DB, {
      job_type,
      created_by: actor.id,
      created_by_name: actor.username,
      permission_scope: permission_scope || null,
      request_json: request_json || {},
      retain_days,
      max_retries,
    });
    const promise = processAsyncJob(env.DB, id);
    if (typeof waitUntil === 'function') waitUntil(promise);
    else await promise;
    await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_CREATE', 'async_jobs', id, { job_type, retain_days, max_retries });
    return json(true, { id, job_type, status: 'queued' }, '任务已创建');
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPut: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async (context) => {
  const { env, request, waitUntil } = context as any;
  try {
    const actor = await requirePermission(env, request, 'async_job_manage', 'admin');
    const body = await request.json<any>().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const id = Number(body?.id || 0);
    if (action === 'cleanup') {
      const deleted = await cleanupExpiredAsyncJobResults(env.DB);
      await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_CLEANUP', 'async_jobs', 'expired', { deleted });
      return json(true, { deleted }, `已清理 ${deleted} 份过期结果`);
    }
    if (!id) return json(false, null, '缺少任务 id', 400);
    if (action === 'cancel') {
      await cancelAsyncJob(env.DB, id);
      await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_CANCEL', 'async_jobs', id, {});
      return json(true, { id }, '已发出取消请求');
    }
    if (action === 'retry') {
      await retryAsyncJob(env.DB, id);
      const promise = processAsyncJob(env.DB, id);
      if (typeof waitUntil === 'function') waitUntil(promise);
      else await promise;
      await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_RETRY', 'async_jobs', id, {});
      return json(true, { id }, '任务已重试');
    }
    return json(false, null, '不支持的操作', 400);
  } catch (e: any) {
    return errorResponse(e);
  }
};
