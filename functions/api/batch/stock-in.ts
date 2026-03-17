import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "../_audit";
import { runBatchWithGuard, GuardRollbackError, safeToken } from "../_write";
import { sqlNowStored } from "../_time";

function batchNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `BIN${y}${m}${day}-${rand}`;
}

function txNo(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

type Line = {
  sku: string;
  qty: number;
  unit_price?: number;
  source?: string;
  remark?: string;
};

type Body = {
  warehouse_id?: number;
  source?: string;
  remark?: string;
  client_request_id?: string; // optional idempotency key
  lines?: Line[];
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "operator");

    const body = (await request.json().catch(() => ({}))) as Body;
    const warehouse_id = Number(body.warehouse_id ?? 1);
    const header_source = body.source ?? null;
    const header_remark = body.remark ?? null;
    const client_request_id = String(body.client_request_id ?? "").trim() || null;
    const lines: Line[] = Array.isArray(body.lines) ? body.lines : [];

    if (!lines.length) return Response.json({ ok: false, message: "没有明细行" }, { status: 400 });

    const batch_no = batchNo();

    // Strict validation (do not silently drop invalid rows)
    const invalid: Array<{ row: number; reason: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const sku = String(l.sku ?? "").trim();
      const qty = Number(l.qty);
      if (!sku) invalid.push({ row: i + 1, reason: "sku 不能为空" });
      if (!qty || qty <= 0) invalid.push({ row: i + 1, reason: "qty 必须 > 0" });
    }
    if (invalid.length) {
      return Response.json({ ok: false, message: "明细校验失败", invalid }, { status: 400 });
    }

    // normalize & aggregate by sku
    const agg = new Map<string, { sku: string; qty: number; unit_price?: number; source?: string; remark?: string }>();
    for (const l of lines) {
      const sku = String(l.sku ?? "").trim();
      const qty = Number(l.qty);
      const cur = agg.get(sku) ?? { sku, qty: 0 };
      cur.qty += qty;
      cur.unit_price = l.unit_price ?? cur.unit_price;
      cur.source = (l.source ?? header_source ?? cur.source) ?? undefined;
      cur.remark = (l.remark ?? header_remark ?? cur.remark) ?? undefined;
      agg.set(sku, cur);
    }
    if (!agg.size) return Response.json({ ok: false, message: "有效行为空（检查 sku/qty）" }, { status: 400 });

    const skus = Array.from(agg.keys());
    const placeholders = skus.map(() => "?").join(",");
    const { results } = await env.DB.prepare(`SELECT id, sku FROM items WHERE enabled=1 AND sku IN (${placeholders})`).bind(...skus).all();
    const skuToId = new Map<string, number>();
    for (const r of results as any[]) skuToId.set(r.sku, r.id);

    const missing = skus.filter((s) => !skuToId.has(s));
    if (missing.length) return Response.json({ ok: false, message: "以下 SKU 不存在/被禁用", missing }, { status: 400 });

    const stmts: D1PreparedStatement[] = [];
    const txs: any[] = [];
    const txNos: string[] = [];

    for (const [sku, l] of agg) {
      const item_id = skuToId.get(sku)!;

      // Idempotency:
      // - if client_request_id is present, make tx_no + ref_no deterministic per sku
      // - otherwise generate random tx_no and use batch_no for ref_no (not unique)
      const ridPart = client_request_id ? safeToken(client_request_id) : null;
      const skuPart = safeToken(sku);
      const no = client_request_id ? `IN-${ridPart}-${skuPart}` : txNo("IN");
      const ref_no = client_request_id ? `rid:${ridPart}:${skuPart}` : batch_no;

      txs.push({ tx_no: no, sku, qty: l.qty });
      txNos.push(no);

      // 1) Insert tx row first, but IGNORE on duplicate ref_no (idempotency)
      stmts.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, unit_price, source, remark, created_by)
           VALUES (?, 'IN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(no, item_id, warehouse_id, l.qty, l.qty, "BATCH_IN", null, ref_no, l.unit_price ?? null, l.source ?? null, l.remark ?? null, user.username)
      );

      // 2) Only update stock if INSERT actually happened (changes()>0)
      stmts.push(
        env.DB.prepare(
          `INSERT INTO stock (item_id, warehouse_id, qty, updated_at)
           SELECT ?, ?, ?, ${sqlNowStored()}
           WHERE (SELECT changes()) > 0
           ON CONFLICT(item_id, warehouse_id) DO UPDATE SET qty = qty + excluded.qty, updated_at=${sqlNowStored()}`
        ).bind(item_id, warehouse_id, l.qty)
      );
    }

    // Guard: ensure all tx rows exist for this request (idempotency safe because tx_no is deterministic when client_request_id provided)
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
        return Response.json({ ok: false, message: "批量入库写入异常，本次已全部回滚（请重试）" }, { status: 409 });
      }
      throw e;
    }

    // Best-effort audit (do not block main flow)
    waitUntil(
      logAudit(env.DB, request, user, "BATCH_IN", "stock_tx", client_request_id ?? batch_no, {
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
