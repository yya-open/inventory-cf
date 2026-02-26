import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { normalizeClientRequestId, toRidRefNo } from "../_idempotency";
import { GuardRollbackError, isGuardRollback } from "./_write";

function txNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `OUT${y}${m}${day}-${rand}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    const { item_id, warehouse_id = 1, qty, target, remark, client_request_id } = await request.json();

    const q = Number(qty);
    const wid = Number(warehouse_id);

    const tgt = String(target ?? "").trim();

    if (!item_id || !q || q <= 0 || !tgt) {
      return Response.json({ ok: false, message: "参数错误" }, { status: 400 });
    }

    const no = txNo();
    const rid = normalizeClientRequestId(client_request_id);
    const refNo = rid ? toRidRefNo(rid) : null;

    // Single-statement atomic write (with guard rollback on unexpected partial effects)
    // Pattern:
    //  - INSERT OR IGNORE into stock_tx only when stock is sufficient (idempotent by ref_no)
    //  - Decrease stock only when stock_tx row was actually inserted
    //  - Guard: inserted rows count must equal stock-update rows count (else rollback)
    let row: any;
    try {
      row = await env.DB
        .prepare(
          `WITH ins AS (
             INSERT OR IGNORE INTO stock_tx (
               tx_no, type, item_id, warehouse_id, qty, delta_qty,
               ref_type, ref_id, ref_no, target, remark, created_by
             )
             SELECT
               ?, 'OUT', ?, ?, ?, ?, 'MANUAL_OUT', NULL, ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM stock
               WHERE item_id=? AND warehouse_id=? AND qty >= ?
             )
             RETURNING tx_no
           ),
           upd AS (
             UPDATE stock
             SET qty = qty - ?, updated_at=datetime('now')
             WHERE item_id=? AND warehouse_id=? AND qty >= ?
               AND EXISTS (SELECT 1 FROM ins)
             RETURNING 1
           )
           SELECT
             (SELECT tx_no FROM ins LIMIT 1) AS tx_no,
             (SELECT COUNT(*) FROM ins) AS ins_n,
             (SELECT COUNT(*) FROM upd) AS upd_n,
             CASE
               WHEN (SELECT COUNT(*) FROM ins) = (SELECT COUNT(*) FROM upd) THEN 1
               ELSE json_extract('[]', '$[')
             END AS guard_ok;`
        )
        .bind(
          no,
          item_id,
          wid,
          q,
          -q,
          refNo || no,
          tgt,
          remark ?? null,
          user.username,
          item_id,
          wid,
          q,
          q,
          item_id,
          wid,
          q
        )
        .first<any>();
    } catch (e: any) {
      if (isGuardRollback(e)) throw new GuardRollbackError();
      throw e;
    }

    const inserted = Number(row?.ins_n || 0);
    if (inserted === 0) {
      // Duplicate idempotent request
      if (refNo) {
        const exist = await env.DB.prepare(`SELECT tx_no FROM stock_tx WHERE ref_no=? LIMIT 1`).bind(refNo).first<any>();
        if (exist?.tx_no) return Response.json({ ok: true, tx_no: exist.tx_no, duplicate: true });
      }
      return Response.json({ ok: false, message: "库存不足，无法出库" }, { status: 409 });
    }

    // Best-effort audit (do not block main flow)
    waitUntil(logAudit(env.DB, request, user, "STOCK_OUT", "stock_tx", no, {
      item_id,
      warehouse_id: wid,
      qty: q,
      target: tgt,
      remark: remark ?? null,
    }).catch(() => {}));
    return Response.json({ ok: true, tx_no: no });
  } catch (e: any) {
    if (e instanceof GuardRollbackError) {
      return Response.json({ ok: false, message: "并发出库冲突，本次已回滚，请重试" }, { status: 409 });
    }
    return errorResponse(e);
  }
};