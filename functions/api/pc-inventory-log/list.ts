import { requireAuth, errorResponse } from '../../_auth';
import { ensurePcSchemaIfAllowed } from '../_pc';
import { buildPcInventoryLogQuery, countPcInventoryLogRows, listPcInventoryLogRows } from '../services/asset-events';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const query = buildPcInventoryLogQuery(url);
    const total = query.fast
      ? null
      : t?.measure
        ? await t.measure('count', async () => countPcInventoryLogRows(env.DB, query))
        : await countPcInventoryLogRows(env.DB, query);
    const data = t?.measure
      ? await t.measure('query', async () => listPcInventoryLogRows(env.DB, query))
      : await listPcInventoryLogRows(env.DB, query);

    return Response.json({ ok: true, data, total, page: query.page, pageSize: query.pageSize });
  } catch (e: any) {
    return errorResponse(e);
  }
};
