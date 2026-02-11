import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "../_audit";

function stNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `ST${y}${m}${day}-${rand}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "admin");

    const { warehouse_id: _warehouse_id = 1 } = await request.json();
    const wid = 1; // 配件仓固定主仓

    const no = stNo();

    // Transaction: header + lines (avoid "header exists but lines missing")
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO stocktake (st_no, warehouse_id, status, created_by) VALUES (?, ?, 'DRAFT', ?)`
      ).bind(no, wid, user.username),
      env.DB.prepare(
        `INSERT INTO stocktake_line (stocktake_id, item_id, system_qty, counted_qty, diff_qty)
         SELECT (SELECT id FROM stocktake WHERE st_no=?), i.id,
                COALESCE(s.qty, 0) AS system_qty,
                NULL AS counted_qty,
                NULL AS diff_qty
         FROM items i
         LEFT JOIN stock s ON s.item_id = i.id AND s.warehouse_id = ?
         WHERE i.enabled = 1`
      ).bind(no, wid),
    ]);

    const row = await env.DB.prepare(`SELECT id FROM stocktake WHERE st_no=?`).bind(no).first<any>();
    const id = Number(row?.id);

    // best-effort audit
    if (id) {
      waitUntil(
        (async () => {
          const cnt = await env.DB.prepare(`SELECT COUNT(1) AS c FROM stocktake_line WHERE stocktake_id=?`).bind(id).first<any>();
          const lines = Number((cnt as any)?.c || 0);
          await logAudit(env.DB, request, user, "STOCKTAKE_CREATE", "stocktake", id, { st_no: no, warehouse_id: wid, lines });
        })().catch(() => {})
      );
    }

    return Response.json({ ok: true, id, st_no: no });
  } catch (e: any) {
    return errorResponse(e);
  }
};
