import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "../_audit";

function txNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `RBK${y}${m}${day}-${rand}`;
}

/**
 * 撤销盘点（Rollback）
 * - 仅管理员可用
 * - 仅允许对已应用(APPLIED)的盘点单执行
 * - 将库存恢复为盘点单明细中的 system_qty（应用前的系统数量）
 * - 写入反向流水 stock_tx(type='REVERSAL')
 * - 将盘点单状态回退为 DRAFT，并清空 applied_at
 */
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "admin");

    const { id } = await request.json();
    const st_id = Number(id);
    if (!st_id) return Response.json({ ok: false, message: "缺少盘点单 id" }, { status: 400 });

    const st = (await env.DB.prepare(`SELECT * FROM stocktake WHERE id=?`).bind(st_id).first()) as any;
    if (!st) return Response.json({ ok: false, message: "盘点单不存在" }, { status: 404 });
    if (st.status !== "APPLIED") return Response.json({ ok: false, message: "仅已应用盘点单可撤销" }, { status: 400 });

    // 取所有有差异的明细行（system_qty 是应用前系统数量）
    const { results } = await env.DB.prepare(
      `SELECT l.*, i.sku
       FROM stocktake_line l
       JOIN items i ON i.id=l.item_id
       WHERE l.stocktake_id=? AND l.diff_qty IS NOT NULL AND l.diff_qty != 0`
    ).bind(st_id).all();

    const stmts: D1PreparedStatement[] = [];
    let reversed = 0;

    for (const l of results as any[]) {
      const diff = Number(l.diff_qty);
      const qty = Math.abs(diff);
      const no = txNo();
      const remark = `撤销盘点 ${st.st_no}`;

      // 写入撤销流水
      stmts.push(
        env.DB.prepare(
          `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, remark, created_by)
           VALUES (?, 'REVERSAL', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(no, l.item_id, st.warehouse_id, qty, -diff, 'STOCKTAKE_ROLLBACK', st_id, st.st_no, remark, user.username)
      );

      // 将库存恢复到盘点前系统数量
      stmts.push(
        env.DB.prepare(
          `INSERT INTO stock (item_id, warehouse_id, qty, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(item_id, warehouse_id) DO UPDATE SET qty=excluded.qty, updated_at=datetime('now')`
        ).bind(l.item_id, st.warehouse_id, Number(l.system_qty))
      );

      reversed++;
    }

    // 回退盘点单状态
    stmts.push(
      env.DB.prepare(`UPDATE stocktake SET status='DRAFT', applied_at=NULL WHERE id=?`).bind(st_id)
    );

    await env.DB.batch(stmts);

    await logAudit(env.DB, request, user, 'STOCKTAKE_ROLLBACK', 'stocktake', st_id, { st_no: st.st_no, reversed });
    return Response.json({ ok: true, reversed });
  } catch (e: any) {
    return errorResponse(e);
  }
};
