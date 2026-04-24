import { errorResponse } from "../_auth";
import { assertPartsStocktakeAccess, requireAuthWithDataScope } from '../services/data-scope';
import { requireConfirm } from "../_confirm";
import { logAudit } from "../_audit";
import { apiFail, apiOk } from '../_response';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuthWithDataScope(env, request, "admin");

    const body: any = await request.json().catch(() => ({}));
    requireConfirm(body, "删除", "二次确认不通过");

    const id = Number(body?.id);
    if (!id) return apiFail('缺少盘点单 id', { status: 400, errorCode: 'MISSING_STOCKTAKE_ID' });

    await assertPartsStocktakeAccess(env.DB, actor, id, '库存盘点');
    const st = (await env.DB.prepare(`SELECT id, status FROM stocktake WHERE id=?`).bind(id).first()) as any;
    if (!st) return apiFail('盘点单不存在', { status: 404, errorCode: 'STOCKTAKE_NOT_FOUND' });
    if (st.status !== "DRAFT") {
      return apiFail('仅草稿状态可删除；已应用盘点请先撤销', { status: 400, errorCode: 'STOCKTAKE_NOT_DRAFT' });
    }

    const r = await env.DB.batch([
      env.DB.prepare(`DELETE FROM stocktake_line WHERE stocktake_id=?`).bind(id),
      env.DB.prepare(`DELETE FROM stocktake WHERE id=? AND status='DRAFT'`).bind(id),
    ]);

    const changes = Number((r?.[1] as any)?.meta?.changes ?? 0);
    await logAudit(env.DB, request, actor, "STOCKTAKE_DELETE", "stocktake", id, { changes });
    return apiOk({ changes });
  } catch (e: any) {
    return errorResponse(e);
  }
};
