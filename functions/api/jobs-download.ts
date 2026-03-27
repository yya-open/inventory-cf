import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';
import { buildAsyncJobDownloadResponse, getAsyncJob } from './services/async-jobs';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requirePermission(env, request, 'async_job_manage', 'admin');
    const id = Number(new URL(request.url).searchParams.get('id') || 0);
    if (!id) return json(false, null, 'id 无效', 400);
    const row = await getAsyncJob(env.DB, id);
    if (!row) return json(false, null, '任务不存在', 404);
    const url = new URL(request.url);
    const inline = ['1', 'true'].includes(String(url.searchParams.get('inline') || '').toLowerCase());
    const print = ['1', 'true'].includes(String(url.searchParams.get('print') || '').toLowerCase());
    return buildAsyncJobDownloadResponse(row, { inline, print });
  } catch (e: any) {
    return errorResponse(e);
  }
};
