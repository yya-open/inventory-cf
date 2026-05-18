import { withErrorHandling } from './_error';
import { buildTxListQuery, countTxRows } from './services/inventory';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  const url = new URL(request.url);
  url.searchParams.set('warehouse_id', String(await assertPartsWarehouseAccess(env.DB, user, Number(url.searchParams.get('warehouse_id') || 1), '出入库明细数量')));
  const query = buildTxListQuery(url);
  const total = await countTxRows(env.DB, query);
  return Response.json({ ok: true, total });
});
