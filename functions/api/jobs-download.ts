import { errorResponse, json } from '../_auth';
import { requirePermission } from '../_permissions';
import { getAsyncJob } from './services/async-jobs';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requirePermission(env, request, 'async_job_manage', 'admin');
    const id = Number(new URL(request.url).searchParams.get('id') || 0);
    if (!id) return json(false, null, 'id 无效', 400);
    const row = await getAsyncJob(env.DB, id);
    if (!row) return json(false, null, '任务不存在', 404);
    if (String(row.status) !== 'success') return json(false, null, '任务尚未完成', 400);
    if (!row.result_text) {
      if (row.result_deleted_at) return json(false, null, '结果文件已过保留期，请重试重新生成', 410);
      return json(false, null, '任务结果不可用', 400);
    }
    return new Response(String(row.result_text), {
      headers: {
        'content-type': String(row.result_content_type || 'text/plain; charset=utf-8'),
        'content-disposition': `attachment; filename="${String(row.result_filename || `job_${id}.csv`)}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
