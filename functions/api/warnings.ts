import { requireAuth, errorResponse, json } from '../_auth';
import { buildWarningsQuery, countWarningsRows, listWarningsRows } from './services/inventory';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    if (!env.DB) return json(false, null, '未绑定 D1 数据库(DB)');

    const query = buildWarningsQuery(new URL(request.url));
    const [total, rows] = await Promise.all([
      countWarningsRows(env.DB, query),
      listWarningsRows(env.DB, query),
    ]);

    return Response.json({
      ok: true,
      data: rows,
      total,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      keyword_mode: query.keyword_mode,
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
