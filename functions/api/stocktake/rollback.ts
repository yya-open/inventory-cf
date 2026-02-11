import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "../_audit";

function txNo(stNo: string, itemId: number) {
  // deterministic per stocktake+item to avoid duplicate reversal on retries
  return `RBK${stNo}-${itemId}`;
}

/**
 * 撤销盘点（Rollback）
 * - 仅管理员可用
 * - 仅允许对已应用(APPLIED)的盘点单执行
 * - 状态流转：APPLIED -> ROLLING -> DRAFT
 * - 若撤销过程中断导致状态停留在 ROLLING，可再次调用继续撤销（幂等）
 * - 将库存恢复为盘点单明细中的 system_qty（应用前的系统数量）
 * - 写入反向流水 stock_tx(type='REVERSAL')（带去重 guard）
 */
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "admin");

    const { id } = await request.json();
    const st_id = Number(id);
    if (!st_id) return Response.json({ ok: false, message: "缺少盘点单 id" }, { status: 400 });

    try {
      const st = (await env.DB.prepare(`SELECT * FROM stocktake WHERE id=?`).bind(st_id).first()) as any;
      if (!st) {
        return Response.json({ ok: false, message: "盘点单不存在" }, { status: 404 });
      }

      const status = String(st.status || "");
      if (status !== "APPLIED" && status !== "ROLLING") {
        return Response.json({ ok: false, message: "仅已应用盘点单可撤销" }, { status: 400 });
      }

      // 状态推进：APPLIED -> ROLLING；若已是 ROLLING 视为继续撤销
      if (status === "APPLIED") {
        const up = await env.DB.prepare(`UPDATE stocktake SET status='ROLLING' WHERE id=? AND status='APPLIED'`).bind(st_id).run();
        if ((up as any)?.meta?.changes !== 1) {
          const cur = (await env.DB.prepare(`SELECT status FROM stocktake WHERE id=?`).bind(st_id).first()) as any;
          if (String(cur?.status) !== "ROLLING") {
            return Response.json({ ok: false, message: "盘点单状态已变化，请刷新后重试" }, { status: 409 });
          }
        }
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

      const rows = (results as any[]) || [];
      let reversed = 0;

      const warehouseId = Number(st.warehouse_id);
      const stNo = String(st.st_no);

      const makeStmtsForLine = (l: any) => {
        const itemId = Number(l.item_id);
        const diff = Number(l.diff_qty);
        if (!itemId || !diff) return [];

        const qty = Math.abs(diff);
        const no = txNo(stNo, itemId);
        const remark = `撤销盘点 ${stNo}`;

        return [
          // 写入撤销流水（去重：同一个 stocktake+item+warehouse 只写一次）
          env.DB.prepare(
            `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, remark, created_by)
             SELECT ?, 'REVERSAL', ?, ?, ?, ?, 'STOCKTAKE_ROLLBACK', ?, ?, ?, ?
             WHERE NOT EXISTS (
               SELECT 1 FROM stock_tx
               WHERE ref_type='STOCKTAKE_ROLLBACK' AND ref_id=? AND item_id=? AND warehouse_id=?
             )`
          ).bind(no, itemId, warehouseId, qty, -diff, st_id, stNo, remark, user.username, st_id, itemId, warehouseId),

          // 将库存恢复到盘点前系统数量（幂等）
          env.DB.prepare(
            `INSERT INTO stock (item_id, warehouse_id, qty, updated_at)
             VALUES (?, ?, ?, datetime('now'))
             ON CONFLICT(item_id, warehouse_id) DO UPDATE SET qty=excluded.qty, updated_at=datetime('now')`
          ).bind(itemId, warehouseId, Number(l.system_qty)),
        ];
      };

      const CHUNK_LINES = 40; // each line expands to 2 stmts
      for (let i = 0; i < rows.length; i += CHUNK_LINES) {
        const part = rows.slice(i, i + CHUNK_LINES);
        const stmts: D1PreparedStatement[] = [];
        for (const l of part) stmts.push(...makeStmtsForLine(l));

        if (!stmts.length) continue;

        const res = await env.DB.batch(stmts);
        // 每 2 条语句为一组：第 1 条是 tx insert
        for (let k = 0; k < res.length; k += 2) {
          const txIns = (res[k] as any)?.meta?.changes || 0;
          if (txIns > 0) reversed += 1;
        }
      }

      // Finalize status: ROLLING -> DRAFT
      const done = await env.DB.prepare(
        `UPDATE stocktake SET status='DRAFT', applied_at=NULL WHERE id=? AND status='ROLLING'`
      )
        .bind(st_id)
        .run();

      if ((done as any)?.meta?.changes !== 1) {
        const cur = (await env.DB.prepare(`SELECT status FROM stocktake WHERE id=?`).bind(st_id).first()) as any;
        if (String(cur?.status) !== "DRAFT") {
          throw new Error("盘点单状态已变化（可能被其他人应用/撤销），本次操作未完成");
        }
      }

      // Best-effort audit
      waitUntil(
        logAudit(env.DB, request, user, "STOCKTAKE_ROLLBACK", "stocktake", st_id, {
          st_no: stNo,
          reversed,
        }).catch(() => {})
      );

      return Response.json({ ok: true, reversed });
    } catch (e: any) {
      if (String(e?.message || "").includes("状态已变化")) {
        return Response.json({ ok: false, message: e.message }, { status: 409 });
      }
      throw e;
    }
  } catch (e: any) {
    return errorResponse(e);
  }
};
