import { requireAuth, errorResponse } from '../_auth';
import { ensurePcSchemaIfAllowed } from './_pc';
import { buildPcTxQuery, countPcTxRows } from './services/asset-events';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });
    const url = new URL(request.url);
    const t = (env as any).__timing;
    if (t?.measure) await t.measure('schema', () => ensurePcSchemaIfAllowed(env.DB, env, url));
    else await ensurePcSchemaIfAllowed(env.DB, env, url);

    const query = buildPcTxQuery(url);
    const total = t?.measure ? await t.measure('count', async () => countPcTxRows(env.DB, query)) : await countPcTxRows(env.DB, query);
    return Response.json({ ok: true, total });
  } catch (e: any) {
    return errorResponse(e);
  }
};
