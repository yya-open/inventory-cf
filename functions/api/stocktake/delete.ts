import { errorResponse } from "../_auth";
import { assertPartsStocktakeAccess, requireAuthWithDataScope } from '../services/data-scope';
import { requireConfirm } from "../../_confirm";
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
    const st = (await env.DB.prepare(`SELECT id, st_no, status FROM stocktake WHERE id=?`).bind(id).first()) as any;
    if (!st) return apiFail('盘点单不存在', { status: 404, errorCode: 'STOCKTAKE_NOT_FOUND' });
    const status = String(st.status || '');
    if (status !== 'DRAFT' && status !== 'APPLIED') {
      return apiFail('仅草稿或已应用完成的盘点单可删除', { status: 400, errorCode: 'STOCKTAKE_INVALID_STATUS' });
    }

    const lineRow = await env.DB.prepare(`SELECT COUNT(1) AS c FROM stocktake_line WHERE stocktake_id=?`).bind(id).first<any>();
    const lineCount = Number(lineRow?.c || 0);
    const r = await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM stocktake_line
         WHERE stocktake_id=?
           AND EXISTS (
             SELECT 1 FROM stocktake
             WHERE id=? AND status IN ('DRAFT','APPLIED')
           )`
      ).bind(id, id),
      env.DB.prepare(`DELETE FROM stocktake WHERE id=? AND status IN ('DRAFT','APPLIED')`).bind(id),
    ]);

    const changes = Number((r?.[1] as any)?.meta?.changes ?? 0);
    if (changes !== 1) {
      return apiFail('盘点单状态已变化，请刷新后重试', { status: 409, errorCode: 'STOCKTAKE_STATUS_CHANGED' });
    }
    await logAudit(env.DB, request, actor, "STOCKTAKE_DELETE", "stocktake", id, { st_no: st.st_no, status, line_count: lineCount, changes });
    return apiOk({ changes, status, line_count: lineCount });
  } catch (e: any) {
    return errorResponse(e);
  }
};
