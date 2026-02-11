import { requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";
import { toSqlRange } from "../_date";

type ClearBody = {
  // if mode === 'all', ignore filters
  mode?: "filtered" | "all";
  type?: string;
  item_id?: number;
  date_from?: string;
  date_to?: string;
  confirm?: string;
};

// POST /api/tx/clear
// Admin-only. Clears transaction rows from stock_tx.
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    // requireAuth returns the authenticated user; we need it for audit logging
    const actor = await requireAuth(env, request, "admin");

    const body = (await request.json().catch(() => ({}))) as ClearBody;
    const mode = body.mode || "filtered";

    // Server-side hard confirm to prevent accidental destructive actions
    const expected = mode === "all" ? "清空全部" : "清空";
    requireConfirm(body, expected, "二次确认不通过");

    const wh: string[] = [];
    const binds: any[] = [];

    // 配件仓固定主仓(id=1)
    wh.push("warehouse_id=?");
    binds.push(1);

    if (mode !== "all") {
      if (body.type) {
        wh.push("type=?");
        binds.push(body.type);
      }
      if (body.item_id) {
        wh.push("item_id=?");
        binds.push(Number(body.item_id));
      }
      const fromSql = toSqlRange(body.date_from, false);
      const toSql = toSqlRange(body.date_to, true);
      if (fromSql) {
        wh.push("created_at >= ?");
        binds.push(fromSql);
      }
      if (toSql) {
        wh.push("created_at <= ?");
        binds.push(toSql);
      }
    }

    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
    const sql = `DELETE FROM stock_tx ${where}`;
    const r = await env.DB.prepare(sql).bind(...binds).run();

    // D1 returns changes in meta
    const deleted = (r as any)?.meta?.changes ?? 0;
    await logAudit(env.DB, request, actor, "TX_CLEAR", "stock_tx", null, {
      mode,
      filters:
        mode === "all"
          ? null
          : { type: body.type, item_id: body.item_id, date_from: body.date_from, date_to: body.date_to },
      deleted,
    });
    return Response.json({ ok: true, data: { deleted } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
