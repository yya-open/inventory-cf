import { requireAuth, errorResponse } from "../_auth";
function txNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `IN${y}${m}${day}-${rand}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  const user = await requireAuth(env, request, "operator");
  const { item_id, warehouse_id = 1, qty, unit_price, source, remark } = await request.json();

  const q = Number(qty);
  if (!item_id || !q || q <= 0) return Response.json({ ok: false, message: "参数错误" }, { status: 400 });

  const no = txNo();

  await env.DB.prepare(
    `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, unit_price, source, remark, created_by)
     VALUES (?, 'IN', ?, ?, ?, ?, ?, ?, ?)`
  ).bind(no, item_id, warehouse_id, q, unit_price ?? null, source ?? null, remark ?? null, user.username).run();

  await env.DB.prepare(
    `INSERT INTO stock (item_id, warehouse_id, qty, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(item_id, warehouse_id) DO UPDATE SET qty = qty + excluded.qty, updated_at=datetime('now')`
  ).bind(item_id, warehouse_id, q).run();

  return Response.json({ ok: true, tx_no: no });
};
