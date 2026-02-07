import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "../_audit";

function txNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `ADJ${y}${m}${day}-${rand}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "admin");

    const body = await request.json().catch(() => ({} as any));
    const st_id = Number((body as any).id);
    if (!st_id) {
      return Response.json({ ok: false, message: "缺少盘点单 id" }, { status: 400 });
    }

    const st = (await env.DB.prepare(`SELECT * FROM stocktake WHERE id=?`).bind(st_id).first()) as any;
    if (!st) {
      return Response.json({ ok: false, message: "盘点单不存在" }, { status: 404 });
    }
    if (st.status !== "DRAFT") {
      return Response.json({ ok: false, message: "盘点单已应用" }, { status: 400 });
    }

    const { results } = await env.DB.prepare(
      `SELECT l.*, i.sku
       FROM stocktake_line l
       JOIN items i ON i.id=l.item_id
       WHERE l.stocktake_id=? 
         AND l.counted_qty IS NOT NULL 
         AND l.diff_qty IS NOT NULL 
         AND l.diff_qty != 0`
    ).bind(st_id).all();

    const stmts: D1PreparedStatement[] = [];
    let adjusted = 0;

    for (const l of results as any[]) {
      const diff = Number(l.diff_qty);
      const qty = Math.abs(diff);
      const no = txNo();
      const remark = `盘点调整 ${st.st_no}`;

      stmts.push(
        env.DB.prepare(
          `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, remark, created_by)
           VALUES (?, 'ADJUST', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(no, l.item_id, st.warehouse_id, qty, diff, "STOCKTAKE_APPLY", st_id, st.st_no, remark, user.username)
      );

      stmts.push(
        env.DB.prepare(
          `INSERT INTO stock (item_id, warehouse_id, qty, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(item_id, warehouse_id) DO UPDATE SET qty=excluded.qty, updated_at=datetime('now')`
        ).bind(l.item_id, st.warehouse_id, Number(l.counted_qty))
      );

      adjusted++;
    }

    // Conditional update: if already applied by others, changes will be 0
    stmts.push(
      env.DB.prepare(`UPDATE stocktake SET status='APPLIED', applied_at=datetime('now') WHERE id=? AND status='DRAFT'`).bind(st_id)
    );

    const rs = await env.DB.batch(stmts);
    const last = rs[rs.length - 1] as any;
    const changes = Number(last?.meta?.changes || 0);
    if (changes === 0) {
      return Response.json({ ok: false, message: "盘点单状态已变化（可能被其他人应用/撤销）" }, { status: 409 });
    }

    // audit (best-effort)
    try {
      await logAudit(env.DB, request, user, "STOCKTAKE_APPLY", "stocktake", st_id, { st_no: st.st_no, adjusted });
    } catch {}

    return Response.json({ ok: true, adjusted });
  } catch (e: any) {
    return errorResponse(e);
  }
};
