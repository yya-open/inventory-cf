import { json } from '../_auth';
import { withErrorHandling } from './_error';
import { requirePermission } from '../_permissions';
import { buildAsyncJobDownloadResponse, assertAsyncJobDownloadAccess, getAsyncJob } from './services/async-jobs';
import { getUserDataScope } from './services/data-scope';

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET?: any }>(async ({ env, request }) => {
  const actor = await requirePermission(env, request, 'async_job_manage', 'viewer');
  const scope = await getUserDataScope(env.DB, actor.id);
  const id = Number(new URL(request.url).searchParams.get('id') || 0);
  if (!id) return json(false, null, 'id 无效', 400);
  const row = await getAsyncJob(env.DB, id, env.BACKUP_BUCKET);
  if (!row) return json(false, null, '任务不存在', 404);
  await assertAsyncJobDownloadAccess(env.DB, row, actor, scope);
  const url = new URL(request.url);
  const inline = ['1', 'true'].includes(String(url.searchParams.get('inline') || '').toLowerCase());
  const print = ['1', 'true'].includes(String(url.searchParams.get('print') || '').toLowerCase());
  return await buildAsyncJobDownloadResponse(row, env.BACKUP_BUCKET, { inline, print });
});
