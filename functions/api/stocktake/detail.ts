import { requireAuth, errorResponse } from '../_auth';
import { getStocktakeById, listStocktakeLines } from '../services/stocktake';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'viewer');
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!id) return Response.json({ ok: false, message: '缺少 id' }, { status: 400 });

    const stocktake = await getStocktakeById(env.DB, id);
    if (!stocktake) return Response.json({ ok: false, message: '盘点单不存在' }, { status: 404 });

    const lines = await listStocktakeLines(env.DB, id);
    return Response.json({ ok: true, stocktake, lines });
  } catch (e: any) {
    return errorResponse(e);
  }
};
