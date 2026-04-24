import { errorResponse } from "../_auth";
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from './services/data-scope';
import { logAudit } from "./_audit";
import { normalizeClientRequestId, toRidRefNo } from "../_idempotency";
import { GuardRollbackError, isGuardRollback } from "./_write";
import { sqlNowStored } from "./_time";
import { apiFail, apiOk } from './_response';

function txNo() {
  return `IN-${crypto.randomUUID()}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, "operator");
    const { item_id, warehouse_id = 1, qty, unit_price, source, remark, client_request_id } = await request.json();
    const allowedWarehouseId = await assertPartsWarehouseAccess(env.DB, user, Number(warehouse_id || 1), "配件入库");

    const q = Number(qty);
    if (!item_id || !q || q <= 0) return apiFail('参数错误', { status: 400, errorCode: 'INVALID_PARAMS' });

    const no = txNo();
    const rid = normalizeClientRequestId(client_request_id);
    const refNo = rid ? toRidRefNo(rid) : null;

    // Use a D1 batch (transactional) and SQLite's changes() to gate side-effects.
    // This avoids data-modifying CTEs, which may not be enabled in all D1 runtimes.
    try {
      await env.DB.batch([
        // 1) Idempotent insert into stock_tx (ref_no unique)
        env.DB.prepare(
          `INSERT OR IGNORE INTO stock_tx (
             tx_no, type, item_id, warehouse_id, qty, delta_qty,
             ref_type, ref_id, ref_no, unit_price, source, remark, created_by
           ) VALUES (?, 'IN', ?, ?, ?, ?, 'MANUAL_IN', NULL, ?, ?, ?, ?, ?);`
        ).bind(
          no,
          item_id,
          allowedWarehouseId,
          q,
          q,
          refNo || no,
          unit_price ?? null,
          source ?? null,
          remark ?? null,
          user.username
        ),
        // 2) Stock upsert ONLY if statement (1) actually inserted a row
        env.DB.prepare(
          `INSERT INTO stock (item_id, warehouse_id, qty, updated_at)
           SELECT ?, ?, ?, ${sqlNowStored()}
           WHERE (SELECT changes()) > 0
           ON CONFLICT(item_id, warehouse_id)
           DO UPDATE SET qty = qty + excluded.qty, updated_at=${sqlNowStored()};`
        ).bind(item_id, allowedWarehouseId, q),
        // 3) Guard: if tx row exists, stock must have been updated exactly once; else updated 0 times.
        // Trigger JSON path error to rollback the whole batch if mismatch.
        env.DB.prepare(
          `SELECT CASE
             WHEN (SELECT changes()) = (CASE WHEN EXISTS (SELECT 1 FROM stock_tx WHERE tx_no=?) THEN 1 ELSE 0 END)
               THEN 1
             ELSE json_extract('[]', '$[')
           END AS guard_ok;`
        ).bind(no),
      ]);
    } catch (e: any) {
      if (isGuardRollback(e)) throw new GuardRollbackError();
      throw e;
    }

    // If idempotent duplicate, return the existing tx_no
    const insertedRow = await env.DB.prepare(`SELECT tx_no FROM stock_tx WHERE tx_no=? LIMIT 1`).bind(no).first<any>();
    if (!insertedRow?.tx_no) {
      if (refNo) {
        const exist = await env.DB.prepare(`SELECT tx_no FROM stock_tx WHERE ref_no=? LIMIT 1`).bind(refNo).first<any>();
        if (exist?.tx_no) return apiOk({ tx_no: exist.tx_no, duplicate: true });
      }
      return apiFail('入库失败', { status: 500, errorCode: 'STOCK_IN_FAILED' });
    }

    // Best-effort audit (don't fail the already-committed business operation)
    waitUntil(logAudit(env.DB, request, user, "STOCK_IN", "stock_tx", no, {
      item_id,
      warehouse_id: allowedWarehouseId,
      qty: q,
      unit_price: unit_price ?? null,
      source: source ?? null,
      remark: remark ?? null,
    }).catch(() => {}));
    return apiOk({ tx_no: no });
  } catch (e: any) {
    if (e instanceof GuardRollbackError) {
      return apiFail('入库写入发生并发冲突，本次已回滚，请重试', { status: 409, errorCode: 'WRITE_CONFLICT' });
    }
    return errorResponse(e);
  }
};
