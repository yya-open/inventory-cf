import { requireAuth, errorResponse } from '../_auth';
import { buildStocktakeListQuery, countStocktakes, listStocktakes } from '../services/stocktake';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    const query = buildStocktakeListQuery(new URL(request.url));
    const [total, data] = await Promise.all([
      countStocktakes(env.DB, query),
      listStocktakes(env.DB, query),
    ]);

    return Response.json({
      ok: true,
      data,
      total,
      page: query.page,
      pageSize: query.pageSize,
      sort_by: query.sort_by,
      sort_dir: query.sort_dir,
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
