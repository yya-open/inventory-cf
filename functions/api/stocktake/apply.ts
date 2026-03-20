import { requireAuth, errorResponse } from '../_auth';
import { requirePermission } from '../../_permissions';
import { logAudit } from '../_audit';
import { sqlNowStored } from '../_time';
import { getStocktakeById, stocktakeAdjustTxNo } from '../services/stocktake';

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requirePermission(env, request, 'stocktake_apply', 'admin');
    const body = await request.json().catch(() => ({} as any));
    const st_id = Number((body as any).id);
    if (!st_id) return Response.json({ ok: false, message: '缺少盘点单 id' }, { status: 400 });

    const st = await getStocktakeById(env.DB, st_id);
    if (!st) return Response.json({ ok: false, message: '盘点单不存在' }, { status: 404 });

    const status = String(st.status || '');
    if (status === 'APPLIED') return Response.json({ ok: false, message: '盘点单已应用' }, { status: 409 });
    if (status !== 'DRAFT' && status !== 'APPLYING') {
      return Response.json({ ok: false, message: '盘点单状态异常，无法应用' }, { status: 409 });
    }

    if (status === 'DRAFT') {
      const up = await env.DB.prepare(`UPDATE stocktake SET status='APPLYING' WHERE id=? AND status='DRAFT'`).bind(st_id).run();
      if ((up as any)?.meta?.changes !== 1) {
        const cur = await env.DB.prepare(`SELECT status FROM stocktake WHERE id=?`).bind(st_id).first<any>();
        if (String(cur?.status) === 'APPLIED') {
          return Response.json({ ok: false, message: '盘点单已应用' }, { status: 409 });
        }
        return Response.json({ ok: false, message: '盘点单状态已变化，请刷新后重试' }, { status: 409 });
      }
    }

    const rows = (
      await env.DB.prepare(`SELECT * FROM stocktake_line WHERE stocktake_id=? AND counted_qty IS NOT NULL`).bind(st_id).all<any>()
    ).results || [];

    let adjusted = 0;
    const warehouseId = Number(st.warehouse_id);
    const CHUNK_LINES = 20;

    for (let i = 0; i < rows.length; i += CHUNK_LINES) {
      const part = rows.slice(i, i + CHUNK_LINES);
      const stmts: D1PreparedStatement[] = [];
      for (const r of part) {
        const itemId = Number(r.item_id);
        const diff = Number(r.diff_qty || 0);
        if (!itemId || !diff) continue;
        const txNo = stocktakeAdjustTxNo(String(st.st_no), itemId);
        stmts.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO stock (item_id, warehouse_id, qty, updated_at) VALUES (?, ?, 0, ${sqlNowStored()})`
          ).bind(itemId, warehouseId),
          env.DB.prepare(
            `UPDATE stock
             SET qty = qty + ?, updated_at=${sqlNowStored()}
             WHERE item_id=? AND warehouse_id=?
               AND (qty + ?) >= 0
               AND NOT EXISTS (
                 SELECT 1 FROM stock_tx
                 WHERE ref_type='STOCKTAKE' AND ref_id=? AND item_id=? AND warehouse_id=?
               )`
          ).bind(diff, itemId, warehouseId, diff, st_id, itemId, warehouseId),
          env.DB.prepare(
            `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, remark, created_by)
             SELECT ?, 'ADJUST', ?, ?, ?, ?, 'STOCKTAKE', ?, ?, ?, ?
             WHERE (SELECT changes()) > 0`
          ).bind(txNo, itemId, warehouseId, Math.abs(diff), diff, st_id, String(st.st_no), '盘点调整', user.username)
        );
      }
      if (!stmts.length) continue;
      const res = await env.DB.batch(stmts);
      for (let k = 0; k < res.length; k += 3) {
        if (((res[k + 2] as any)?.meta?.changes || 0) > 0) adjusted += 1;
      }
    }

    const done = await env.DB.prepare(
      `UPDATE stocktake SET status='APPLIED', applied_at=${sqlNowStored()} WHERE id=? AND status='APPLYING'`
    ).bind(st_id).run();
    if ((done as any)?.meta?.changes !== 1) {
      const cur = await env.DB.prepare(`SELECT status FROM stocktake WHERE id=?`).bind(st_id).first<any>();
      if (String(cur?.status) !== 'APPLIED') {
        return Response.json({ ok: false, message: '盘点单状态异常，未能完成应用' }, { status: 409 });
      }
    }

    waitUntil(
      logAudit(env.DB, request, user, 'STOCKTAKE_APPLY', 'stocktake', st_id, {
        st_no: st.st_no,
        adjusted,
      }).catch(() => {})
    );

    return Response.json({ ok: true, adjusted });
  } catch (e: any) {
    return errorResponse(e);
  }
};
