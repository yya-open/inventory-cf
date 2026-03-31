import { errorResponse, json } from '../_auth';
import { buildWarningsQuery, countWarningsRows, listWarningsRows } from './services/inventory';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return json(false, null, '未绑定 D1 数据库(DB)');

    const query = buildWarningsQuery(new URL(request.url));
    query.warehouse_id = await assertPartsWarehouseAccess(env.DB, user, query.warehouse_id, '预警中心');
    const rows = await listWarningsRows(env.DB, query);
    const total = query.fast ? undefined : await countWarningsRows(env.DB, query);

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
