import { withErrorHandling } from '../_error';
import { ensurePcSchemaIfAllowed } from '../_pc';
import { buildPcInventoryLogQuery, countPcInventoryLogRows, listPcInventoryLogRows } from '../services/asset-events';
import { requireAuthWithDataScope } from '../services/data-scope';

export const onRequestGet = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuthWithDataScope(env, request, 'viewer');
  if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
  const url = new URL(request.url);
  const t = (env as any).__timing;
  if (t?.measure) await t.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));
  else await ensurePcSchemaIfAllowed(env.DB, env, url);

  const query = buildPcInventoryLogQuery(url, user);
  const totalTask = query.fast
    ? Promise.resolve(null)
    : t?.measure
      ? t.measure('count', async () => countPcInventoryLogRows(env.DB, query))
      : countPcInventoryLogRows(env.DB, query);
  const dataTask = t?.measure
    ? t.measure('query', async () => listPcInventoryLogRows(env.DB, query))
    : listPcInventoryLogRows(env.DB, query);
  const [total, data] = await Promise.all([totalTask, dataTask]);

  return Response.json({ ok: true, data, total, page: query.page, pageSize: query.pageSize });
});
