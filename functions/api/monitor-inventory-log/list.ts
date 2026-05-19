import { withErrorHandling } from '../_error';
import { ensureMonitorSchemaIfAllowed } from '../_monitor';
import { buildMonitorInventoryLogQuery, countMonitorInventoryLogRows, listMonitorInventoryLogRows } from '../services/asset-events';
import { requireAuthWithDataScope } from '../services/data-scope';

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
  const url = new URL(request.url);
  const t = (env as any).__timing;
  if (t?.measure) await t.measure('schema', () => ensureMonitorSchemaIfAllowed(env.DB, env, url));
  else await ensureMonitorSchemaIfAllowed(env.DB, env, url);

  const query = buildMonitorInventoryLogQuery(url, user);
  const totalTask = query.fast
    ? Promise.resolve(null)
    : t?.measure
      ? t.measure('count', async () => countMonitorInventoryLogRows(env.DB, query))
      : countMonitorInventoryLogRows(env.DB, query);
  const dataTask = t?.measure
    ? t.measure('query', async () => listMonitorInventoryLogRows(env.DB, query))
    : listMonitorInventoryLogRows(env.DB, query);
  const [total, data] = await Promise.all([totalTask, dataTask]);

  return Response.json({ ok: true, data, total, page: query.page, pageSize: query.pageSize });
});
