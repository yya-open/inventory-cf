import { requireAuth, errorResponse } from '../_auth';
import { buildTxListQuery, countTxRows, listTxRows } from './services/inventory';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    const query = buildTxListQuery(new URL(request.url));
    const [total, rows] = await Promise.all([
      countTxRows(env.DB, query),
      listTxRows(env.DB, query),
    ]);

    return Response.json({
      ok: true,
      data: rows,
      total,
      page: query.page,
      pageSize: query.pageSize,
      sort_by: query.sort_by,
      sort_dir: query.sort_dir,
      keyword_mode: query.keyword_mode,
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
