import { errorResponse } from '../_auth';
import { ensureMonitorSchemaIfAllowed } from './_monitor';
import { buildMonitorTxQuery, countMonitorTxRows, listMonitorTxRows } from './services/asset-events';
import { requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const query = buildMonitorTxQuery(url, user);
    const total = query.fast ? null : await countMonitorTxRows(env.DB, query);
    const data = await listMonitorTxRows(env.DB, query);
    return Response.json({ ok: true, data, total, page: query.page, pageSize: query.pageSize });
  } catch (e: any) {
    return errorResponse(e);
  }
};
