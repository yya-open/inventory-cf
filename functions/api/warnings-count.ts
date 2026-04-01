import { errorResponse, json } from '../_auth';
import { buildWarningsQuery, countWarningsRows } from './services/inventory';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return json(false, null, '未绑定 D1 数据库(DB)');
    const url = new URL(request.url);
    url.searchParams.set('warehouse_id', String(await assertPartsWarehouseAccess(env.DB, user, Number(url.searchParams.get('warehouse_id') || 1), '预警中心数量')));
    const query = buildWarningsQuery(url);
    const total = await countWarningsRows(env.DB, query);
    return Response.json({ ok: true, total });
  } catch (e: any) {
    return errorResponse(e);
  }
};
