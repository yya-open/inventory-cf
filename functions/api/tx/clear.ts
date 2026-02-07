import { json, requireAuth, errorResponse } from "../../_auth";
import { logAudit } from "../_audit";
import { requireConfirm } from "../../_confirm";

type ClearBody = {
  // if mode === 'all', ignore filters
  mode?: "filtered" | "all";
  type?: string;
  item_id?: number;
  warehouse_id?: number;
  date_from?: string;
  date_to?: string;
  // hard confirmation
  confirm?: string;
};

// POST /api/tx/clear
// Admin-only. Clears transaction rows from stock_tx.
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");

    const body = (await request.json().catch(() => ({}))) as ClearBody;
    const mode = body.mode || "filtered";

    // Hard protection
    // - 清空全部：要求输入「清空全部」
    // - 清空筛选：要求输入「清空」
    requireConfirm(body, mode === "all" ? "清空全部" : "清空", "二次确认文本不正确");

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
      if (body.warehouse_id) {
        wh.push("warehouse_id=?");
        binds.push(Number(body.warehouse_id));
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

    const deleted = Number((r as any)?.meta?.changes ?? 0);

    await logAudit(env.DB, request, actor, "TX_CLEAR", "stock_tx", null, {
      mode,
      filters:
        mode === "all"
          ? null
          : {
              type: body.type,
              item_id: body.item_id,
              warehouse_id: body.warehouse_id,
              date_from: body.date_from,
              date_to: body.date_to,
            },
      deleted,
    });

    return json(true, { deleted });
  } catch (e: any) {
    return errorResponse(e);
  }
};
