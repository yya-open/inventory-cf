import { errorResponse } from '../_auth';
import { buildStockListQuery, countStockRows } from './services/inventory';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    const url = new URL(request.url);
    url.searchParams.set('warehouse_id', String(await assertPartsWarehouseAccess(env.DB, user, Number(url.searchParams.get('warehouse_id') || 1), '库存查询数量')));
    const query = buildStockListQuery(url);
    const total = await countStockRows(env.DB, query);
    return Response.json({ ok: true, total });
  } catch (e: any) {
    return errorResponse(e);
  }
};
