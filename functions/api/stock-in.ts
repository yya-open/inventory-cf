import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { normalizeClientRequestId, toRidRefNo } from "../_idempotency";
import { GuardRollbackError, isGuardRollback } from "./_write";

function txNo() {
  return `IN-${crypto.randomUUID()}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    const { item_id, warehouse_id = 1, qty, unit_price, source, remark, client_request_id } = await request.json();

    const q = Number(qty);
    if (!item_id || !q || q <= 0) return Response.json({ ok: false, message: "参数错误" }, { status: 400 });

    const no = txNo();
    const rid = normalizeClientRequestId(client_request_id);
    const refNo = rid ? toRidRefNo(rid) : null;

    // Single-statement atomic write (with guard rollback on unexpected partial effects)
    // Pattern:
    //  - INSERT OR IGNORE into stock_tx (idempotent by ref_no)
    //  - Apply stock upsert only when stock_tx row was actually inserted
    //  - Guard: inserted rows count must equal stock-upsert rows count (else rollback)
    let row: any;
    try {
      row = await env.DB
        .prepare(
          `WITH ins AS (
             INSERT OR IGNORE INTO stock_tx (
               tx_no, type, item_id, warehouse_id, qty, delta_qty,
               ref_type, ref_id, ref_no, unit_price, source, remark, created_by
             )
             VALUES (?, 'IN', ?, ?, ?, ?, 'MANUAL_IN', NULL, ?, ?, ?, ?, ?)
             RETURNING tx_no
           ),
           upd AS (
             INSERT INTO stock (item_id, warehouse_id, qty, updated_at)
             SELECT ?, ?, ?, datetime('now')
             WHERE EXISTS (SELECT 1 FROM ins)
             ON CONFLICT(item_id, warehouse_id)
             DO UPDATE SET qty = qty + excluded.qty, updated_at=datetime('now')
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
          warehouse_id,
          q,
          q,
          refNo || no,
          unit_price ?? null,
          source ?? null,
          remark ?? null,
          user.username,
          item_id,
          warehouse_id,
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
      return Response.json({ ok: false, message: "入库失败" }, { status: 500 });
    }

    // Best-effort audit (don't fail the already-committed business operation)
    waitUntil(logAudit(env.DB, request, user, "STOCK_IN", "stock_tx", no, {
      item_id,
      warehouse_id,
      qty: q,
      unit_price: unit_price ?? null,
      source: source ?? null,
      remark: remark ?? null,
    }).catch(() => {}));
    return Response.json({ ok: true, tx_no: no });
  } catch (e: any) {
    if (e instanceof GuardRollbackError) {
      return Response.json({ ok: false, message: "入库写入发生并发冲突，本次已回滚，请重试" }, { status: 409 });
    }
    return errorResponse(e);
  }
};