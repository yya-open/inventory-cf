import { errorResponse } from '../_auth';
import { apiOk } from '../_response';
import { buildStocktakeListQuery, countStocktakes, listStocktakes } from '../services/stocktake';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from '../services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    const url = new URL(request.url);
    url.searchParams.set('warehouse_id', String(await assertPartsWarehouseAccess(env.DB, user, Number(url.searchParams.get('warehouse_id') || 1), '库存盘点')));
    const query = buildStocktakeListQuery(url);
    const [total, data] = await Promise.all([
      countStocktakes(env.DB, query),
      listStocktakes(env.DB, query),
    ]);

    return apiOk(data, {
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        sort_by: query.sort_by,
        sort_dir: query.sort_dir,
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
