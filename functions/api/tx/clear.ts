import { withErrorHandling } from '../_error';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from '../services/data-scope';
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";
import { toSqlRange } from "../_date";

type ClearBody = {
  // if mode === 'all', ignore filters
  mode?: "filtered" | "all";
  type?: string;
  item_id?: number;
  warehouse_id?: number;
  date_from?: string;
  date_to?: string;
  confirm?: string;
};

// POST /api/tx/clear
// Admin-only. Clears transaction rows from stock_tx.
export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request, waitUntil }) => {
  // requireAuth returns the authenticated user; we need it for audit logging
  const actor = await requireAuthWithDataScope(env, request, "admin");

  const body = (await request.json().catch(() => ({}))) as ClearBody;
  const mode = body.mode || "filtered";

  // Server-side hard confirm to prevent accidental destructive actions
  const expected = mode === "all" ? "清空全部" : "清空";
  requireConfirm(body, expected, "二次确认不通过");

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

  const requestedWarehouseId = body.warehouse_id && Number.isFinite(Number(body.warehouse_id))
    ? Number(body.warehouse_id)
    : null;
  const allowedWarehouseId = await assertPartsWarehouseAccess(env.DB, actor, requestedWarehouseId, '出入库明细清理');
  wh.push("warehouse_id=?");
  binds.push(allowedWarehouseId);

  const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
  const sql = `DELETE FROM stock_tx ${where}`;
  const r = await env.DB.prepare(sql).bind(...binds).run();

  // D1 returns changes in meta
  const deleted = (r as any)?.meta?.changes ?? 0;
  waitUntil(logAudit(env.DB, request, actor, "TX_CLEAR", "stock_tx", null, {
    mode,
    filters:
      mode === "all"
        ? { warehouse_id: allowedWarehouseId }
        : { type: body.type, item_id: body.item_id, warehouse_id: allowedWarehouseId, date_from: body.date_from, date_to: body.date_to },
    deleted,
  }).catch(() => {}));
  return Response.json({ ok: true, data: { deleted } });
});
