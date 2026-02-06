import { requireAuth, errorResponse } from "../_auth";
function txNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `OUT${y}${m}${day}-${rand}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  const user = await requireAuth(env, request, "operator");
  const { item_id, warehouse_id = 1, qty, target, remark } = await request.json();

  const q = Number(qty);
  if (!item_id || !q || q <= 0) return Response.json({ ok: false, message: "参数错误" }, { status: 400 });

  const r = await env.DB.prepare(
    `UPDATE stock
     SET qty = qty - ?, updated_at=datetime('now')
     WHERE item_id=? AND warehouse_id=? AND qty >= ?`
  ).bind(q, item_id, warehouse_id, q).run();

  if ((r.meta?.changes || 0) === 0) {
    return Response.json({ ok: false, message: "库存不足，无法出库" }, { status: 409 });
  }

  const no = txNo();
  await env.DB.prepare(
    `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, target, remark, created_by)
     VALUES (?, 'OUT', ?, ?, ?, ?, ?, ?)`
  ).bind(no, item_id, warehouse_id, q, target ?? null, remark ?? null, user.username).run();

  return Response.json({ ok: true, tx_no: no });
};
