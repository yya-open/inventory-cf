import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';
import { createAsyncJob, listAsyncJobs, processAsyncJob } from './services/async-jobs';
import { logAudit } from './_audit';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requirePermission(env, request, 'async_job_manage', 'admin');
    const limit = Math.max(1, Math.min(200, Number(new URL(request.url).searchParams.get('limit') || 100)));
    return json(true, await listAsyncJobs(env.DB, limit));
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async (context) => {
  const { env, request, waitUntil } = context as any;
  try {
    const actor = await requirePermission(env, request, 'async_job_manage', 'admin');
    const { job_type, request_json, permission_scope } = await request.json<any>();
    const id = await createAsyncJob(env.DB, {
      job_type,
      created_by: actor.id,
      created_by_name: actor.username,
      permission_scope: permission_scope || null,
      request_json: request_json || {},
    });
    if (typeof waitUntil === 'function') waitUntil(processAsyncJob(env.DB, id));
    else await processAsyncJob(env.DB, id);
    await logAudit(env.DB, request, actor, 'ADMIN_ASYNC_JOB_CREATE', 'async_jobs', id, { job_type });
    return json(true, { id, job_type, status: 'queued' }, '任务已创建');
  } catch (e: any) {
    return errorResponse(e);
  }
};
