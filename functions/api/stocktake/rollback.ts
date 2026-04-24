import { errorResponse } from '../_auth';
import { logAudit } from '../_audit';
import { apiFail, apiOk } from '../_response';
import { sqlNowStored } from '../_time';
import { getStocktakeById, stocktakeRollbackTxNo } from '../services/stocktake';
import { assertPartsStocktakeAccess, requireAuthWithDataScope } from '../services/data-scope';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'admin');
    const { id } = await request.json();
    const st_id = Number(id);
    if (!st_id) return apiFail('缺少盘点单 id', { status: 400, errorCode: 'MISSING_STOCKTAKE_ID' });

    try {
      await assertPartsStocktakeAccess(env.DB, user, st_id, '库存盘点');
      const st = await getStocktakeById(env.DB, st_id);
      if (!st) return apiFail('盘点单不存在', { status: 404, errorCode: 'STOCKTAKE_NOT_FOUND' });

      const status = String(st.status || '');
      if (status !== 'APPLIED' && status !== 'ROLLING') {
        return apiFail('仅已应用盘点单可撤销', { status: 400, errorCode: 'STOCKTAKE_NOT_APPLIED' });
      }

      if (status === 'APPLIED') {
        const up = await env.DB.prepare(`UPDATE stocktake SET status='ROLLING' WHERE id=? AND status='APPLIED'`).bind(st_id).run();
        if ((up as any)?.meta?.changes !== 1) {
          const cur = await env.DB.prepare(`SELECT status FROM stocktake WHERE id=?`).bind(st_id).first<any>();
          if (String(cur?.status) !== 'ROLLING') {
            return apiFail('盘点单状态已变化，请刷新后重试', { status: 409, errorCode: 'STOCKTAKE_STATUS_CHANGED' });
          }
        }
      }

      const rows = (
        await env.DB.prepare(
          `SELECT l.*, i.sku
           FROM stocktake_line l
           JOIN items i ON i.id=l.item_id
           WHERE l.stocktake_id=? AND l.diff_qty IS NOT NULL AND l.diff_qty != 0`
        ).bind(st_id).all<any>()
      ).results || [];

      let reversed = 0;
      const warehouseId = Number(st.warehouse_id);
      const stNo = String(st.st_no);
      const CHUNK_LINES = 40;

      for (let i = 0; i < rows.length; i += CHUNK_LINES) {
        const part = rows.slice(i, i + CHUNK_LINES);
        const stmts: D1PreparedStatement[] = [];
        for (const l of part) {
          const itemId = Number(l.item_id);
          const diff = Number(l.diff_qty);
          if (!itemId || !diff) continue;
          stmts.push(
            env.DB.prepare(
              `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, remark, created_by)
               SELECT ?, 'REVERSAL', ?, ?, ?, ?, 'STOCKTAKE_ROLLBACK', ?, ?, ?, ?
               WHERE NOT EXISTS (
                 SELECT 1 FROM stock_tx
                 WHERE ref_type='STOCKTAKE_ROLLBACK' AND ref_id=? AND item_id=? AND warehouse_id=?
               )`
            ).bind(stocktakeRollbackTxNo(stNo, itemId), itemId, warehouseId, Math.abs(diff), -diff, st_id, stNo, `撤销盘点 ${stNo}`, user.username, st_id, itemId, warehouseId),
            env.DB.prepare(
              `INSERT INTO stock (item_id, warehouse_id, qty, updated_at)
               VALUES (?, ?, ?, ${sqlNowStored()})
               ON CONFLICT(item_id, warehouse_id) DO UPDATE SET qty=excluded.qty, updated_at=${sqlNowStored()}`
            ).bind(itemId, warehouseId, Number(l.system_qty))
          );
        }
        if (!stmts.length) continue;
        const res = await env.DB.batch(stmts);
        for (let k = 0; k < res.length; k += 2) {
          if (((res[k] as any)?.meta?.changes || 0) > 0) reversed += 1;
        }
      }

      const done = await env.DB.prepare(`UPDATE stocktake SET status='DRAFT', applied_at=NULL WHERE id=? AND status='ROLLING'`).bind(st_id).run();
      if ((done as any)?.meta?.changes !== 1) {
        const cur = await env.DB.prepare(`SELECT status FROM stocktake WHERE id=?`).bind(st_id).first<any>();
        if (String(cur?.status) !== 'DRAFT') throw new Error('盘点单状态已变化（可能被其他人应用/撤销），本次操作未完成');
      }

      waitUntil(
        logAudit(env.DB, request, user, 'STOCKTAKE_ROLLBACK', 'stocktake', st_id, { st_no: stNo, reversed }).catch(() => {})
      );
      return apiOk({ reversed });
    } catch (e: any) {
      if (String(e?.message || '').includes('状态已变化')) {
        return apiFail(e.message, { status: 409, errorCode: 'STOCKTAKE_STATUS_CHANGED' });
      }
      throw e;
    }
  } catch (e: any) {
    return errorResponse(e);
  }
};
