import { withErrorHandling } from '../_error';
import { assertPartsWarehouseAccess, requireAuthWithDataScope } from '../services/data-scope';
import { logAudit } from "../_audit";
import { runBatchWithGuard, GuardRollbackError, safeToken } from "../_write";
import { sqlNowStored } from "../_time";
import { resolveItemsByName } from "../services/item-names";

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
  name: string;
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

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request, waitUntil }) => {
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
    const name = String(l.name ?? "").trim();
    const qty = Number(l.qty);
    const tgt = String((l.target ?? "") || headerT).trim();
    if (!name) invalid.push({ row: i + 1, reason: "名称不能为空" });
    if (!qty || qty <= 0) invalid.push({ row: i + 1, reason: "qty 必须 > 0" });
    if (!tgt) invalid.push({ row: i + 1, reason: "target 不能为空（领用人必填）" });
  }
  if (invalid.length) {
    return Response.json({ ok: false, message: "明细校验失败", invalid }, { status: 400 });
  }

  // Normalize and aggregate by item name before resolving each name to a unique item.
  const agg = new Map<string, { name: string; qty: number; target?: string; remark?: string }>();
  for (const l of lines) {
    const name = String(l.name ?? "").trim();
    const qty = Number(l.qty);
    const cur = agg.get(name) ?? { name, qty: 0 };
    cur.qty += qty;
    cur.target = String((l.target ?? "") || headerT).trim();
    cur.remark = (l.remark ?? header_remark ?? cur.remark) ?? undefined;
    agg.set(name, cur);
  }
  if (!agg.size) return Response.json({ ok: false, message: "有效行为空（检查名称/数量）" }, { status: 400 });

  const batch_no = batchNo();

  const names = Array.from(agg.keys());
  const nameMatches = await resolveItemsByName(env.DB, names);

  const missing = names.filter((name) => !nameMatches.has(name));
  if (missing.length) return Response.json({ ok: false, message: "以下名称不存在/被禁用", missing }, { status: 400 });
  const ambiguous = names.filter((name) => (nameMatches.get(name)?.length || 0) > 1);
  if (ambiguous.length) return Response.json({ ok: false, message: "以下名称对应多个配件，请使用唯一名称", ambiguous }, { status: 400 });

  const resolvedAgg = new Map<number, {
    item_id: number;
    sku: string;
    input_names: string[];
    qty: number;
    target?: string;
    remark?: string;
  }>();
  for (const [name, l] of agg) {
    const match = nameMatches.get(name)![0];
    const cur = resolvedAgg.get(match.id) ?? {
      item_id: match.id,
      sku: match.sku,
      input_names: [],
      qty: 0,
    };
    cur.qty += l.qty;
    cur.input_names.push(name);
    cur.target = l.target ?? cur.target;
    cur.remark = l.remark ?? cur.remark;
    resolvedAgg.set(match.id, cur);
  }

  // Fast pre-check (still guarded against concurrency below)
  const itemIds = Array.from(resolvedAgg.keys());
  const ph2 = itemIds.map(() => "?").join(",");
  const { results: stockRows } = await env.DB.prepare(`SELECT item_id, qty FROM stock WHERE warehouse_id=? AND item_id IN (${ph2})`)
    .bind(warehouse_id, ...itemIds)
    .all();
  const curQty = new Map<number, number>();
  for (const r of stockRows as any[]) curQty.set(r.item_id, Number(r.qty));

  const insufficient: any[] = [];
  for (const l of resolvedAgg.values()) {
    const have = curQty.get(l.item_id) ?? 0;
    if (have < l.qty) insufficient.push({ sku: l.sku, input_names: l.input_names, need: l.qty, have });
  }
  if (insufficient.length) return Response.json({ ok: false, message: "库存不足", insufficient }, { status: 400 });

  // Concurrency-safe + Idempotent batch out:
  // - Insert tx row first, but only if stock currently has enough (EXISTS check)
  // - Update stock only if INSERT happened (changes()>0), and still requires qty>=? to handle races
  // - Final guard ensures all tx rows exist; otherwise rollback everything.
  const stmts: D1PreparedStatement[] = [];
  const txs: any[] = [];
  const txNos: string[] = [];

  for (const l of resolvedAgg.values()) {
    const item_id = l.item_id;

    const ridPart = client_request_id ? safeToken(client_request_id) : null;
    const skuPart = safeToken(l.sku);
    const no = client_request_id ? `OUT-${ridPart}-${skuPart}` : txNo("OUT");
    const ref_no = client_request_id ? `rid:${ridPart}:${skuPart}` : batch_no;

    txs.push({ tx_no: no, sku: l.sku, input_names: l.input_names, qty: l.qty });
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
});
