import { errorResponse } from "../_auth";
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from '../services/data-scope';
import { logAudit } from "../_audit";
import { runBatchWithGuard, GuardRollbackError, safeToken } from "../_write";
import { sqlNowStored } from "../_time";

function batchNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `BOUT${y}${m}${day}-${rand}`;
}

function txNo(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

type Line = {
  sku: string;
  qty: number;
  target?: string;
  remark?: string;
};

type Body = {
  warehouse_id?: number;
  target?: string;
  remark?: string;
  client_request_id?: string; // optional idempotency key
  lines?: Line[];
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, "operator");

    const body = (await request.json().catch(() => ({}))) as Body;
    const warehouse_id = await assertPartsWarehouseAccess(env.DB, user, Number(body.warehouse_id ?? 1), "批量出库");
    const header_target = body.target ?? null;
    const header_remark = body.remark ?? null;
    const client_request_id = String(body.client_request_id ?? "").trim() || null;
    const lines: Line[] = Array.isArray(body.lines) ? body.lines : [];

    if (!lines.length) return Response.json({ ok: false, message: "没有明细行" }, { status: 400 });

    // Strict validation (do not silently drop invalid rows)
    const invalid: Array<{ row: number; reason: string }> = [];
    const headerT = String(header_target ?? "").trim();
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const sku = String(l.sku ?? "").trim();
      const qty = Number(l.qty);
      const tgt = String((l.target ?? "") || headerT).trim();
      if (!sku) invalid.push({ row: i + 1, reason: "sku 不能为空" });
      if (!qty || qty <= 0) invalid.push({ row: i + 1, reason: "qty 必须 > 0" });
      if (!tgt) invalid.push({ row: i + 1, reason: "target 不能为空（领用人必填）" });
    }
    if (invalid.length) {
      return Response.json({ ok: false, message: "明细校验失败", invalid }, { status: 400 });
    }

    // normalize & aggregate by sku
    const agg = new Map<string, { sku: string; qty: number; target?: string; remark?: string }>();
    for (const l of lines) {
      const sku = String(l.sku ?? "").trim();
      const qty = Number(l.qty);
      const cur = agg.get(sku) ?? { sku, qty: 0 };
      cur.qty += qty;
      cur.target = String((l.target ?? "") || headerT).trim();
      cur.remark = (l.remark ?? header_remark ?? cur.remark) ?? undefined;
      agg.set(sku, cur);
    }
    if (!agg.size) return Response.json({ ok: false, message: "有效行为空（检查 sku/qty）" }, { status: 400 });

    const batch_no = batchNo();

    const skus = Array.from(agg.keys());
    const placeholders = skus.map(() => "?").join(",");
    const { results } = await env.DB.prepare(`SELECT id, sku FROM items WHERE enabled=1 AND sku IN (${placeholders})`).bind(...skus).all();
    const skuToId = new Map<string, number>();
    for (const r of results as any[]) skuToId.set(r.sku, r.id);

    const missing = skus.filter((s) => !skuToId.has(s));
    if (missing.length) return Response.json({ ok: false, message: "以下 SKU 不存在/被禁用", missing }, { status: 400 });

    // Fast pre-check (still guarded against concurrency below)
    const itemIds = skus.map((s) => skuToId.get(s)!);
    const ph2 = itemIds.map(() => "?").join(",");
    const { results: stockRows } = await env.DB.prepare(`SELECT item_id, qty FROM stock WHERE warehouse_id=? AND item_id IN (${ph2})`)
      .bind(warehouse_id, ...itemIds)
      .all();
    const curQty = new Map<number, number>();
    for (const r of stockRows as any[]) curQty.set(r.item_id, Number(r.qty));

    const insufficient: any[] = [];
    for (const [sku, l] of agg) {
      const item_id = skuToId.get(sku)!;
      const have = curQty.get(item_id) ?? 0;
      if (have < l.qty) insufficient.push({ sku, need: l.qty, have });
    }
    if (insufficient.length) return Response.json({ ok: false, message: "库存不足", insufficient }, { status: 400 });

    // Concurrency-safe + Idempotent batch out:
    // - Insert tx row first, but only if stock currently has enough (EXISTS check)
    // - Update stock only if INSERT happened (changes()>0), and still requires qty>=? to handle races
    // - Final guard ensures all tx rows exist; otherwise rollback everything.
    const stmts: D1PreparedStatement[] = [];
    const txs: any[] = [];
    const txNos: string[] = [];

    for (const [sku, l] of agg) {
      const item_id = skuToId.get(sku)!;

      const ridPart = client_request_id ? safeToken(client_request_id) : null;
      const skuPart = safeToken(sku);
      const no = client_request_id ? `OUT-${ridPart}-${skuPart}` : txNo("OUT");
      const ref_no = client_request_id ? `rid:${ridPart}:${skuPart}` : batch_no;

      txs.push({ tx_no: no, sku, qty: l.qty });
      txNos.push(no);

      // 1) Insert tx only if stock currently has enough; IGNORE on duplicate ref_no (idempotency)
      stmts.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, target, remark, created_by)
           SELECT ?, 'OUT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS(
             SELECT 1 FROM stock
             WHERE item_id=? AND warehouse_id=? AND qty >= ?
           )`
        ).bind(no, item_id, warehouse_id, l.qty, -l.qty, "BATCH_OUT", null, ref_no, l.target!, l.remark ?? null, user.username, item_id, warehouse_id, l.qty)
      );

      // 2) Update stock only if INSERT happened, and still check qty>=? for races
      stmts.push(
        env.DB.prepare(
          `UPDATE stock
           SET qty = qty - ?, updated_at=${sqlNowStored()}
           WHERE item_id=? AND warehouse_id=? AND qty >= ?
             AND (SELECT changes()) > 0`
        ).bind(l.qty, item_id, warehouse_id, l.qty)
      );
    }

    const phTx = txNos.map(() => "?").join(",");
    stmts.push(
      env.DB.prepare(
        `SELECT CASE
           WHEN (SELECT COUNT(*) FROM stock_tx WHERE tx_no IN (${phTx})) = ?
           THEN 1
           ELSE json_extract('{"a":1}', '$[')
         END AS ok`
      ).bind(...txNos, txNos.length)
    );

    try {
      await runBatchWithGuard(env.DB, stmts);
    } catch (e: any) {
      if (e instanceof GuardRollbackError) {
        return Response.json({ ok: false, message: "库存不足（可能存在并发出库），本次批量出库已全部回滚" }, { status: 409 });
      }
      throw e;
    }

    waitUntil(
      logAudit(env.DB, request, user, "BATCH_OUT", "stock_tx", client_request_id ?? batch_no, {
        warehouse_id,
        count: txs.length,
        client_request_id,
      }).catch(() => {})
    );
    return Response.json({ ok: true, batch_no, client_request_id, count: txs.length, txs });
  } catch (e: any) {
    return errorResponse(e);
  }
};
