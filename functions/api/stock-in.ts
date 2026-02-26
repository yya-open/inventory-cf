import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { normalizeClientRequestId, toRidRefNo, isUniqueConstraintError } from "../_idempotency";

function txNo() {
  return `IN-${crypto.randomUUID()}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    const { item_id, warehouse_id = 1, qty, unit_price, source, remark, client_request_id } = await request.json();

    const q = Number(qty);
    const wid = Number(warehouse_id);
    if (!item_id || !Number.isFinite(wid) || wid <= 0 || !q || q <= 0) {
      return Response.json({ ok: false, message: "参数错误" }, { status: 400 });
    }

    const rid = normalizeClientRequestId(client_request_id);
    const refNo = rid ? toRidRefNo(rid) : null;

    // If the same request was already processed, return the existing tx_no.
    if (refNo) {
      const exist = await env.DB.prepare(`SELECT tx_no FROM stock_tx WHERE ref_no=? LIMIT 1`).bind(refNo).first<any>();
      if (exist?.tx_no) return Response.json({ ok: true, tx_no: exist.tx_no, duplicate: true });
    }

    const no = txNo();
    // Concurrency-safe ordering (important for idempotency):
    // 1) Insert tx row first (unique ref_no for rid:* prevents double-processing).
    // 2) Only after successful insert, upsert stock (guarded by changes()>0).
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, unit_price, source, remark, created_by)
           VALUES (?, 'IN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(no, item_id, wid, q, q, "MANUAL_IN", null, (refNo || no), unit_price ?? null, source ?? null, remark ?? null, user.username),

        env.DB.prepare(
          `INSERT INTO stock (item_id, warehouse_id, qty, updated_at)
           SELECT ?, ?, ?, datetime('now')
           WHERE (SELECT changes()) > 0
           ON CONFLICT(item_id, warehouse_id)
           DO UPDATE SET qty = qty + excluded.qty, updated_at=datetime('now')`
        ).bind(item_id, wid, q),
      ]);
    } catch (e: any) {
      // If insert failed due to idempotency unique index, return the existing tx_no.
      if (refNo && isUniqueConstraintError(e)) {
        const exist = await env.DB.prepare(`SELECT tx_no FROM stock_tx WHERE ref_no=? LIMIT 1`).bind(refNo).first<any>();
        if (exist?.tx_no) return Response.json({ ok: true, tx_no: exist.tx_no, duplicate: true });
      }
      throw e;
    }
// Best-effort audit (don't fail the already-committed business operation)
    waitUntil(logAudit(env.DB, request, user, "STOCK_IN", "stock_tx", no, {
      item_id,
      warehouse_id: wid,
      qty: q,
      unit_price: unit_price ?? null,
      source: source ?? null,
      remark: remark ?? null,
    }).catch(() => {}));
    return Response.json({ ok: true, tx_no: no });
  } catch (e: any) {
    return errorResponse(e);
  }
};