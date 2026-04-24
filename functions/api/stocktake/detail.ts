import { errorResponse } from '../_auth';
import { apiFail, apiOk } from '../_response';
import { getStocktakeById, listStocktakeLines } from '../services/stocktake';
import { assertPartsStocktakeAccess, requireAuthWithDataScope } from '../services/data-scope';

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!id) return apiFail('缺少 id', { status: 400, errorCode: 'MISSING_STOCKTAKE_ID' });

    await assertPartsStocktakeAccess(env.DB, user, id, '库存盘点');
    const stocktake = await getStocktakeById(env.DB, id);
    if (!stocktake) return apiFail('盘点单不存在', { status: 404, errorCode: 'STOCKTAKE_NOT_FOUND' });

    const lines = await listStocktakeLines(env.DB, id);
    return apiOk({ stocktake, lines });
  } catch (e: any) {
    return errorResponse(e);
  }
};
