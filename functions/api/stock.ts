import { requireAuth, errorResponse } from '../_auth';
import { buildStockListQuery, countStockRows, listStockRows } from './services/inventory';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    const query = buildStockListQuery(new URL(request.url));
    const [total, rows] = await Promise.all([
      countStockRows(env.DB, query),
      listStockRows(env.DB, query),
    ]);

    return Response.json({
      ok: true,
      data: rows,
      total,
      page: query.page,
      pageSize: query.pageSize,
      keyword_mode: query.keyword_mode,
      sort: query.sort,
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
