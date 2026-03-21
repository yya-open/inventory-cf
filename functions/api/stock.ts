import { errorResponse } from '../_auth';
import { buildStockListQuery, countStockRows, listStockRows } from './services/inventory';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    const query = buildStockListQuery(new URL(request.url));
    query.warehouse_id = await assertPartsWarehouseAccess(env.DB, user, query.warehouse_id, '库存查询');
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
