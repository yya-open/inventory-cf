import { json } from '../_auth';
import { withErrorHandling } from './_error';
import { buildWarningsQuery, countWarningsRows, listWarningsRows } from './services/inventory';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from './services/data-scope';

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const timing = (env as any).__timing;
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  if (!env.DB) return json(false, null, '未绑定 D1 数据库(DB)');

  const query = buildWarningsQuery(new URL(request.url));
  query.warehouse_id = await assertPartsWarehouseAccess(env.DB, user, query.warehouse_id, '预警中心');
  const rowsTask = timing?.measure
    ? timing.measure('warnings_query', () => listWarningsRows(env.DB, query))
    : listWarningsRows(env.DB, query);
  const totalTask = query.fast
    ? Promise.resolve(undefined)
    : timing?.measure
      ? timing.measure('warnings_count', () => countWarningsRows(env.DB, query))
      : countWarningsRows(env.DB, query);
  const [rows, total] = await Promise.all([rowsTask, totalTask]);

  return Response.json({
    ok: true,
    data: rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    keyword_mode: query.keyword_mode,
  });
});
