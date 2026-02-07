import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "../_audit";

function txNo() {
  return `RBK-${crypto.randomUUID()}`;
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

    try {
      await env.DB.prepare("BEGIN IMMEDIATE").run();

      const st = (await env.DB.prepare(`SELECT * FROM stocktake WHERE id=?`).bind(st_id).first()) as any;
      if (!st) {
        await env.DB.prepare("ROLLBACK").run().catch(() => {});
        return Response.json({ ok: false, message: "盘点单不存在" }, { status: 404 });
      }
      if (st.status !== "APPLIED") {
        await env.DB.prepare("ROLLBACK").run().catch(() => {});
        return Response.json({ ok: false, message: "仅已应用盘点单可撤销" }, { status: 400 });
      }

      // 取所有有差异的明细行（system_qty 是应用前系统数量）
      const { results } = await env.DB.prepare(
        `SELECT l.*, i.sku
         FROM stocktake_line l
         JOIN items i ON i.id=l.item_id
         WHERE l.stocktake_id=? AND l.diff_qty IS NOT NULL AND l.diff_qty != 0`
      )
        .bind(st_id)
        .all();

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
          ).bind(no, l.item_id, st.warehouse_id, qty, -diff, "STOCKTAKE_ROLLBACK", st_id, st.st_no, remark, user.username)
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

      // Conditional status update to avoid double-rollback; if already rolled back, changes will be 0.
      stmts.push(env.DB.prepare(`UPDATE stocktake SET status='DRAFT', applied_at=NULL WHERE id=? AND status='APPLIED'`).bind(st_id));

      const rs = await env.DB.batch(stmts);
      const statusChanges = rs[rs.length - 1]?.meta?.changes || 0;
      if (statusChanges === 0) {
        throw new Error("盘点单状态已变化（可能被其他人应用/撤销），本次操作已回滚");
      }

      await env.DB.prepare("COMMIT").run();

      // Best-effort audit
      logAudit(env.DB, request, user, "STOCKTAKE_ROLLBACK", "stocktake", st_id, { st_no: st.st_no, reversed }).catch(() => {});
      return Response.json({ ok: true, reversed });
    } catch (e: any) {
      await env.DB.prepare("ROLLBACK").run().catch(() => {});
      if (String(e?.message || "").includes("状态已变化")) {
        return Response.json({ ok: false, message: e.message }, { status: 409 });
      }
      throw e;
    }
  } catch (e: any) {
    return errorResponse(e);
  }
};
