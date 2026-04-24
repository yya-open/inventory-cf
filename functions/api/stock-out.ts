import { errorResponse } from "../_auth";
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from './services/data-scope';
import { logAudit } from "./_audit";
import { normalizeClientRequestId, toRidRefNo } from "../_idempotency";
import { GuardRollbackError, isGuardRollback } from "./_write";
import { sqlNowStored } from "./_time";
import { apiFail, apiOk } from './_response';

function txNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `OUT${y}${m}${day}-${rand}`;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, "operator");
    const { item_id, warehouse_id = 1, qty, target, remark, client_request_id } = await request.json();

    const q = Number(qty);
    const wid = await assertPartsWarehouseAccess(env.DB, user, Number(warehouse_id), "配件出库");

    const tgt = String(target ?? "").trim();

    if (!item_id || !q || q <= 0 || !tgt) {
      return apiFail('参数错误', { status: 400, errorCode: 'INVALID_PARAMS' });
    }

    const no = txNo();
    const rid = normalizeClientRequestId(client_request_id);
    const refNo = rid ? toRidRefNo(rid) : null;

    // Use a D1 batch (transactional) and SQLite's changes() to gate side-effects.
    // This avoids data-modifying CTEs, which may not be enabled in all D1 runtimes.
    try {
      await env.DB.batch([
        // 1) Insert stock_tx only when stock is sufficient; idempotent by ref_no
        env.DB.prepare(
          `INSERT OR IGNORE INTO stock_tx (
             tx_no, type, item_id, warehouse_id, qty, delta_qty,
             ref_type, ref_id, ref_no, target, remark, created_by
           )
           SELECT
             ?, 'OUT', ?, ?, ?, ?, 'MANUAL_OUT', NULL, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM stock
             WHERE item_id=? AND warehouse_id=? AND qty >= ?
           );`
        ).bind(
          no,
          item_id,
          wid,
          q,
          -q,
          refNo || no,
          tgt,
          remark ?? null,
          user.username,
          item_id,
          wid,
          q
        ),
        // 2) Decrease stock only when (1) inserted a row, and re-check stock is sufficient
        env.DB.prepare(
          `UPDATE stock
           SET qty = qty - ?, updated_at=${sqlNowStored()}
           WHERE item_id=? AND warehouse_id=? AND qty >= ?
             AND (SELECT changes()) > 0;`
        ).bind(q, item_id, wid, q),
        // 3) Guard: if tx row exists, stock must have been updated exactly once; else updated 0 times.
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

    // If duplicate idempotent request, return existing tx_no
    const insertedRow = await env.DB.prepare(`SELECT tx_no FROM stock_tx WHERE tx_no=? LIMIT 1`).bind(no).first<any>();
    if (!insertedRow?.tx_no) {
      if (refNo) {
        const exist = await env.DB.prepare(`SELECT tx_no FROM stock_tx WHERE ref_no=? LIMIT 1`).bind(refNo).first<any>();
        if (exist?.tx_no) return apiOk({ tx_no: exist.tx_no, duplicate: true });
      }
      return apiFail('库存不足，无法出库', { status: 409, errorCode: 'INSUFFICIENT_STOCK' });
    }

    // Best-effort audit (do not block main flow)
    waitUntil(logAudit(env.DB, request, user, "STOCK_OUT", "stock_tx", no, {
      item_id,
      warehouse_id: wid,
      qty: q,
      target: tgt,
      remark: remark ?? null,
    }).catch(() => {}));
    return apiOk({ tx_no: no });
  } catch (e: any) {
    if (e instanceof GuardRollbackError) {
      return apiFail('并发出库冲突，本次已回滚，请重试', { status: 409, errorCode: 'WRITE_CONFLICT' });
    }
    return errorResponse(e);
  }
};
