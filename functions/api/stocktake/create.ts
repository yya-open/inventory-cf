import { errorResponse } from '../_auth';
import { logAudit } from '../_audit';
import { apiOk } from '../_response';
import { createStocktake, generateStocktakeNo } from '../services/stocktake';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from '../services/data-scope';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'admin');
    const { warehouse_id = 1 } = await request.json();
    const wid = await assertPartsWarehouseAccess(env.DB, user, Number(warehouse_id), '库存盘点');
    const stNo = generateStocktakeNo();
    const id = await createStocktake(env.DB, stNo, wid, user.username);

    if (id) {
      waitUntil(
        (async () => {
          const cnt = await env.DB.prepare(`SELECT COUNT(1) AS c FROM stocktake_line WHERE stocktake_id=?`).bind(id).first<any>();
          const lines = Number(cnt?.c || 0);
          await logAudit(env.DB, request, user, 'STOCKTAKE_CREATE', 'stocktake', id, { st_no: stNo, warehouse_id: wid, lines });
        })().catch(() => {})
      );
    }

    return apiOk({ id, st_no: stNo });
  } catch (e: any) {
    return errorResponse(e);
  }
};
