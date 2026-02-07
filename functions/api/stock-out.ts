import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";

function txNo() {
  return `OUT-${crypto.randomUUID()}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    const { item_id, warehouse_id = 1, qty, target, remark } = await request.json();

    const q = Number(qty);
    if (!item_id || !q || q <= 0) return Response.json({ ok: false, message: "参数错误" }, { status: 400 });

    const no = txNo();

    // Atomic (D1-compatible):
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

    let inserted = 0;

    try {
      // D1 的 batch 本身是原子事务，不要使用 SQL BEGIN/COMMIT（Cloudflare 会报错）
      const rs = await env.DB.batch(stmts);
      inserted = (rs[1] as any)?.meta?.changes || 0;

      if (inserted === 0) {
        return Response.json({ ok: false, message: "库存不足，无法出库" }, { status: 409 });
      }
    } catch (e) {
      throw e;
    }
// Best-effort audit
    logAudit(env.DB, request, user, "STOCK_OUT", "stock_tx", no, {
      item_id,
      warehouse_id,
      qty: q,
      target: target ?? null,
      remark: remark ?? null,
    }).catch(() => {});

    return Response.json({ ok: true, tx_no: no });
  } catch (e: any) {
    return errorResponse(e);
  }
};
