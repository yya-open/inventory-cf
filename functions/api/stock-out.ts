import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";

function txNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `OUT${y}${m}${day}-${rand}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    const { item_id, warehouse_id = 1, qty, target, remark } = await request.json();

    const q = Number(qty);
    if (!item_id || !q || q <= 0) return Response.json({ ok: false, message: "参数错误" }, { status: 400 });

    const no = txNo();

    // Atomic (D1-compatible): run UPDATE then INSERT conditionally.
    // - UPDATE uses qty>=? to prevent negative stock.
    // - INSERT only happens when the immediately previous UPDATE changed 1 row (SELECT changes()>0).
    const stmts: D1PreparedStatement[] = [
      env.DB.prepare(
        `UPDATE stock
         SET qty = qty - ?, updated_at=datetime('now')
         WHERE item_id=? AND warehouse_id=? AND qty >= ?`
      ).bind(q, item_id, warehouse_id, q),

      env.DB.prepare(
        `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, target, remark, created_by)
         SELECT ?, 'OUT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE (SELECT changes()) > 0`
      ).bind(no, item_id, warehouse_id, q, -q, "MANUAL_OUT", null, no, target ?? null, remark ?? null, user.username),
    ];

    await env.DB.exec("BEGIN");
    try {
      const rs: any[] = await env.DB.batch(stmts);
      const inserted = rs[1]?.meta?.changes || 0;

      if (inserted === 0) {
        await env.DB.exec("ROLLBACK");
        return Response.json({ ok: false, message: "库存不足，无法出库" }, { status: 409 });
      }

      await env.DB.exec("COMMIT");
    } catch (err) {
      await env.DB.exec("ROLLBACK");
      throw err;
    }

    await logAudit(env.DB, request, user, "STOCK_OUT", "stock_tx", no, {
      item_id,
      warehouse_id,
      qty: q,
      target: target ?? null,
      remark: remark ?? null,
    });

    return Response.json({ ok: true, tx_no: no });
  } catch (e: any) {
    return errorResponse(e);
  }
};
