import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { normalizeClientRequestId, toRidRefNo, isUniqueConstraintError } from "../_idempotency";

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

    if (!item_id || !q || q <= 0) {
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

    // Atomic (D1-compatible): run UPDATE then INSERT conditionally in a single batch.
    // - UPDATE uses qty>=? to prevent negative stock.
    // - INSERT only happens when the immediately previous UPDATE changed 1 row (SELECT changes()>0).
    const stmts: D1PreparedStatement[] = [
      env.DB.prepare(
        `UPDATE stock
         SET qty = qty - ?, updated_at=datetime('now')
         WHERE item_id=? AND warehouse_id=? AND qty >= ?`
      ).bind(q, item_id, wid, q),

      env.DB.prepare(
        `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, target, remark, created_by)
         SELECT ?, 'OUT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE (SELECT changes()) > 0`
      ).bind(
        no,
        item_id,
        wid,
        q,
        -q,
        "MANUAL_OUT",
        null,
        (refNo || no),
        target ?? null,
        remark ?? null,
        user.username
      ),
    ];

    let rs: any[];
    try {
      rs = await env.DB.batch(stmts) as any;
    } catch (e: any) {
      if (refNo && isUniqueConstraintError(e)) {
        const exist = await env.DB.prepare(`SELECT tx_no FROM stock_tx WHERE ref_no=? LIMIT 1`).bind(refNo).first<any>();
        if (exist?.tx_no) return Response.json({ ok: true, tx_no: exist.tx_no, duplicate: true });
      }
      throw e;
    }
    const inserted = (rs[1] as any)?.meta?.changes || 0;

    if (inserted === 0) {
      return Response.json({ ok: false, message: "库存不足，无法出库" }, { status: 409 });
    }

    // Best-effort audit (do not block main flow)
    waitUntil(logAudit(env.DB, request, user, "STOCK_OUT", "stock_tx", no, {
      item_id,
      warehouse_id: wid,
      qty: q,
      target: target ?? null,
      remark: remark ?? null,
    }).catch(() => {}));
    return Response.json({ ok: true, tx_no: no });
  } catch (e: any) {
    return errorResponse(e);
  }
};