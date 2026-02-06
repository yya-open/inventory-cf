import { requireAuth, errorResponse } from "../_auth";

function stNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `ST${y}${m}${day}-${rand}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, \"admin\");

    const { warehouse_id = 1 } = await request.json();
    const wid = Number(warehouse_id);

    const no = stNo();
    const ins = await env.DB.prepare(
      `INSERT INTO stocktake (st_no, warehouse_id, status, created_by) VALUES (?, ?, 'DRAFT', ?)`
    ).bind(no, wid, user.username).run();

    const st_id = ins.meta.last_row_id as number;

    // create lines for all enabled items
    // system_qty from stock; default 0
    await env.DB.prepare(
      `INSERT INTO stocktake_line (stocktake_id, item_id, system_qty, counted_qty, diff_qty)
       SELECT ?, i.id,
              COALESCE(s.qty, 0) AS system_qty,
              NULL AS counted_qty,
              NULL AS diff_qty
       FROM items i
       LEFT JOIN stock s ON s.item_id = i.id AND s.warehouse_id = ?
       WHERE i.enabled = 1`
    ).bind(st_id, wid).run();

    return Response.json({ ok: true, id: st_id, st_no: no });
  } catch (e:any) {
    return errorResponse(e);
  }
};
