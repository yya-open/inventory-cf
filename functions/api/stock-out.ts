import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";

function txNo() {
  return `OUT-${crypto.randomUUID()}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "operator");
    const { item_id, warehouse_id = 1, qty, target, remark } =
      (await request.json<any>().catch(() => ({}))) || {};

    const itemId = Number(item_id);
    const whId = Number(warehouse_id);
    const q = Number(qty);

    if (!itemId || !whId || !q || q <= 0) {
      return Response.json({ ok: false, message: "参数错误" }, { status: 400 });
    }

    const no = txNo();
    const now = new Date().toISOString();

    // D1 不支持 BEGIN/COMMIT：用 batch 保证原子性
    // 1) 扣减库存（库存不足则不变更 changes=0）
    // 2) 写入出库流水
    const stmts = [
      env.DB.prepare(
        `UPDATE stock SET qty = qty - ?, updated_at = ?
         WHERE item_id = ? AND warehouse_id = ? AND qty >= ?`
      ).bind(q, now, itemId, whId, q),

      env.DB.prepare(
        `INSERT INTO stock_tx (no, type, item_id, warehouse_id, qty, delta, target, remark, created_at)
         VALUES (?, 'OUT', ?, ?, ?, ?, ?, ?, ?)`
      ).bind(no, itemId, whId, q, -q, target ?? null, remark ?? null, now),
    ];

    let inserted = 0;
    try {
      const rs = await env.DB.batch(stmts);
      inserted = (rs[0] as any)?.meta?.changes || 0;

      if (inserted === 0) {
        return Response.json({ ok: false, message: "库存不足，无法出库" }, { status: 409 });
      }
    } catch (e) {
      throw e;
    }

    // Best-effort audit
    logAudit(env.DB, request, user, "STOCK_OUT", "stock_tx", no, {
      item_id: itemId,
      warehouse_id: whId,
      qty: q,
      target: target ?? null,
      remark: remark ?? null,
    }).catch(() => {});

    return Response.json({ ok: true, tx_no: no });
  } catch (e: any) {
    return errorResponse(e);
  }
};
