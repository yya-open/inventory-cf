import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "../_audit";

function txNo(stNo: string, itemId: number) {
  // deterministic per stocktake+item to avoid double-apply on retries
  return `ADJ${stNo}-${itemId}`;
}

/**
 * 应用盘点（Apply）
 * - 仅管理员可用
 * - 状态流转：DRAFT -> APPLYING -> APPLIED
 * - 若上次应用中断导致状态停留在 APPLYING，可再次调用继续应用（幂等）
 */
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "admin");

    const body = await request.json().catch(() => ({} as any));
    const st_id = Number((body as any).id);
    if (!st_id) {
      return Response.json({ ok: false, message: "缺少盘点单 id" }, { status: 400 });
    }

    const st = (await env.DB.prepare(`SELECT * FROM stocktake WHERE id=? AND warehouse_id=1`).bind(st_id).first()) as any;
    if (!st) {
      return Response.json({ ok: false, message: "盘点单不存在" }, { status: 404 });
    }

    const status = String(st.status || "");
    if (status === "APPLIED") {
      return Response.json({ ok: false, message: "盘点单已应用" }, { status: 409 });
    }
    if (status !== "DRAFT" && status !== "APPLYING") {
      return Response.json({ ok: false, message: "盘点单状态异常，无法应用" }, { status: 409 });
    }

    // 状态推进：DRAFT -> APPLYING；若已是 APPLYING 视为继续应用
    if (status === "DRAFT") {
      const up = await env.DB.prepare(
        `UPDATE stocktake SET status='APPLYING' WHERE id=? AND warehouse_id=1 AND status='DRAFT'`
      )
        .bind(st_id)
        .run();

      if ((up as any)?.meta?.changes !== 1) {
        // 可能被并发修改
        const cur = (await env.DB.prepare(`SELECT status FROM stocktake WHERE id=? AND warehouse_id=1`).bind(st_id).first()) as any;
        if (String(cur?.status) === "APPLIED") {
          return Response.json({ ok: false, message: "盘点单已应用" }, { status: 409 });
        }
        return Response.json({ ok: false, message: "盘点单状态已变化，请刷新后重试" }, { status: 409 });
      }
    }

    const lines =
      (await env.DB.prepare(
        `SELECT * FROM stocktake_line WHERE stocktake_id=? AND counted_qty IS NOT NULL`
      )
        .bind(st_id)
        .all()) as any;

    const rows: any[] = lines?.results || [];
    let adjusted = 0;

    // Apply per line in chunks (D1 batch)
    // Idempotency: use EXISTS(stock_tx ref) guard + deterministic tx_no.
    const warehouseId = Number(st.warehouse_id);

    const makeStmtsForLine = (r: any) => {
      const itemId = Number(r.item_id);
      const diff = Number(r.diff_qty || 0);
      if (!itemId || !diff) return [];
      const tx = txNo(String(st.st_no), itemId);

      return [
        // ensure stock row exists
        env.DB.prepare(
          `INSERT OR IGNORE INTO stock (item_id, warehouse_id, qty, updated_at) VALUES (?, ?, 0, datetime('now'))`
        ).bind(itemId, warehouseId),

        // adjust stock only if not already applied for this (stocktake,item,warehouse)
        env.DB.prepare(
          `UPDATE stock
           SET qty = qty + ?, updated_at=datetime('now')
           WHERE item_id=? AND warehouse_id=?
             AND (qty + ?) >= 0
             AND NOT EXISTS (
               SELECT 1 FROM stock_tx
               WHERE ref_type='STOCKTAKE' AND ref_id=? AND item_id=? AND warehouse_id=?
             )`
        ).bind(diff, itemId, warehouseId, diff, st_id, itemId, warehouseId),

        // insert tx if the previous UPDATE changed a row
        env.DB.prepare(
          `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, remark, created_by)
           SELECT ?, 'ADJUST', ?, ?, ?, ?, 'STOCKTAKE', ?, ?, ?, ?
           WHERE (SELECT changes()) > 0`
        ).bind(
          tx,
          itemId,
          warehouseId,
          Math.abs(diff),
          diff,
          st_id,
          String(st.st_no),
          "盘点调整",
          user.username
        ),
      ];
    };

    const CHUNK_LINES = 20; // each line expands to 3 stmts; keep batch size reasonable
    for (let i = 0; i < rows.length; i += CHUNK_LINES) {
      const part = rows.slice(i, i + CHUNK_LINES);
      const stmts: D1PreparedStatement[] = [];
      for (const r of part) stmts.push(...makeStmtsForLine(r));

      if (!stmts.length) continue;

      const res = await env.DB.batch(stmts);

      // count inserted tx rows (every 3rd statement per line)
      for (let k = 0; k < res.length; k += 3) {
        const txIns = (res[k + 2] as any)?.meta?.changes || 0;
        if (txIns > 0) adjusted += 1;
      }
    }

    // Finalize status: APPLYING -> APPLIED
    const done = await env.DB.prepare(
      `UPDATE stocktake SET status='APPLIED', applied_at=datetime('now') WHERE id=? AND status='APPLYING'`
    )
      .bind(st_id)
      .run();

    if ((done as any)?.meta?.changes !== 1) {
      // 如果并发或重复请求导致 changes=0，则检查是否已 APPLIED
      const cur = (await env.DB.prepare(`SELECT status FROM stocktake WHERE id=? AND warehouse_id=1`).bind(st_id).first()) as any;
      if (String(cur?.status) !== "APPLIED") {
        return Response.json({ ok: false, message: "盘点单状态异常，未能完成应用" }, { status: 409 });
      }
    }

    // Best-effort audit
    waitUntil(
      logAudit(env.DB, request, user, "STOCKTAKE_APPLY", "stocktake", st_id, {
        st_no: st.st_no,
        adjusted,
      }).catch(() => {})
    );

    return Response.json({ ok: true, adjusted });
  } catch (e: any) {
    return errorResponse(e);
  }
};
