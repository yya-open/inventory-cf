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
    const url = new URL(request.url);
    const inline = ['1', 'true'].includes(String(url.searchParams.get('inline') || '').toLowerCase());
    const print = ['1', 'true'].includes(String(url.searchParams.get('print') || '').toLowerCase());
    const filename = String(row.result_filename || `job_${id}.txt`);
    const contentType = String(row.result_content_type || 'text/plain; charset=utf-8');
    let bodyText = String(row.result_text);
    if (print && contentType.includes('text/html')) {
      const printScript = `<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),120));</script>`;
      bodyText = /<\/body>/i.test(bodyText) ? bodyText.replace(/<\/body>/i, `${printScript}</body>`) : `${bodyText}${printScript}`;
    }
    return new Response(bodyText, {
      headers: {
        'content-type': contentType,
        'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
