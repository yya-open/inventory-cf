import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";

function txNo() {
  return `IN-${crypto.randomUUID()}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    const { item_id, warehouse_id = 1, qty, unit_price, source, remark } = await request.json();

    const q = Number(qty);
    if (!item_id || !q || q <= 0) return Response.json({ ok: false, message: "参数错误" }, { status: 400 });

    const no = txNo();

    try {
      // Transaction: prevent partial writes (stock updated but tx missing / or vice versa)
      await env.DB.prepare("BEGIN IMMEDIATE").run();

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, unit_price, source, remark, created_by)
           VALUES (?, 'IN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(no, item_id, warehouse_id, q, q, "MANUAL_IN", null, no, unit_price ?? null, source ?? null, remark ?? null, user.username),

        env.DB.prepare(
          `INSERT INTO stock (item_id, warehouse_id, qty, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(item_id, warehouse_id) DO UPDATE SET qty = qty + excluded.qty, updated_at=datetime('now')`
        ).bind(item_id, warehouse_id, q),
      ]);

      await env.DB.prepare("COMMIT").run();
    } catch (e) {
      await env.DB.prepare("ROLLBACK").run().catch(() => {});
      throw e;
    }

    // Best-effort audit (don't fail the already-committed business operation)
    logAudit(env.DB, request, user, "STOCK_IN", "stock_tx", no, {
      item_id,
      warehouse_id,
      qty: q,
      unit_price: unit_price ?? null,
      source: source ?? null,
      remark: remark ?? null,
    }).catch(() => {});

    return Response.json({ ok: true, tx_no: no });
  } catch (e: any) {
    return errorResponse(e);
  }
};
