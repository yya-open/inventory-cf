import { requireAuth, errorResponse } from "../../_auth";
import { logAudit } from "../_audit";

type ClearBody = {
  // if mode === 'all', ignore filters
  mode?: "filtered" | "all";
  type?: string;
  item_id?: number;
  date_from?: string;
  date_to?: string;
};

// POST /api/tx/clear
// Admin-only. Clears transaction rows from stock_tx.
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    // requireAuth returns the authenticated user; we need it for audit logging
    const actor = await requireAuth(env, request, "admin");

    const body = (await request.json().catch(() => ({}))) as ClearBody;
    const mode = body.mode || "filtered";

    const wh: string[] = [];
    const binds: any[] = [];

    if (mode !== "all") {
      if (body.type) {
        wh.push("type=?");
        binds.push(body.type);
      }
      if (body.item_id) {
        wh.push("item_id=?");
        binds.push(Number(body.item_id));
      }
      if (body.date_from) {
        wh.push("created_at >= ?");
        binds.push(body.date_from);
      }
      if (body.date_to) {
        wh.push("created_at <= ?");
        binds.push(body.date_to);
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
