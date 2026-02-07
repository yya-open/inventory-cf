import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "../_audit";

function batchNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `BOUT${y}${m}${day}-${rand}`;
}

function txNo() {
  return `OUT-${crypto.randomUUID()}`;
}

type Line = {
  sku: string;
  qty: number;
  target?: string;
  remark?: string;
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "operator");

    const body = await request.json();
    const warehouse_id = Number(body.warehouse_id ?? 1);
    const header_target = body.target ?? null;
    const header_remark = body.remark ?? null;
    const lines: Line[] = Array.isArray(body.lines) ? body.lines : [];

    if (!lines.length) return Response.json({ ok: false, message: "没有明细行" }, { status: 400 });

    // normalize & aggregate by sku
    const agg = new Map<string, { sku: string; qty: number; target?: string; remark?: string }>();
    for (const l of lines) {
      const sku = String(l.sku ?? "").trim();
      const qty = Number(l.qty);
      if (!sku || !qty || qty <= 0) continue;
      const cur = agg.get(sku) ?? { sku, qty: 0 };
      cur.qty += qty;
      cur.target = (l.target ?? header_target ?? cur.target) ?? undefined;
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

    // Check stock for all involved items (fast pre-check; still guarded against concurrency below)
    const itemIds = skus.map((s) => skuToId.get(s)!);
    const ph2 = itemIds.map(() => "?").join(",");
    const { results: stockRows } = await env.DB.prepare(
      `SELECT item_id, qty FROM stock WHERE warehouse_id=? AND item_id IN (${ph2})`
    ).bind(warehouse_id, ...itemIds).all();
    const curQty = new Map<number, number>();
    for (const r of stockRows as any[]) curQty.set(r.item_id, Number(r.qty));

    const insufficient: any[] = [];
    for (const [sku, l] of agg) {
      const item_id = skuToId.get(sku)!;
      const have = curQty.get(item_id) ?? 0;
      if (have < l.qty) insufficient.push({ sku, need: l.qty, have });
    }
    if (insufficient.length) return Response.json({ ok: false, message: "库存不足", insufficient }, { status: 400 });

    // Concurrency-safe batch out:
    // - Each line uses conditional UPDATE (qty>=?) + INSERT only if changes()>0
    // - A guard statement verifies all tx rows were inserted; otherwise it throws to rollback everything.
    const stmts: D1PreparedStatement[] = [];
    const txs: any[] = [];
    const txNos: string[] = [];

    for (const [sku, l] of agg) {
      const item_id = skuToId.get(sku)!;
      const no = txNo();
      txs.push({ tx_no: no, sku, qty: l.qty });
      txNos.push(no);

      stmts.push(
        env.DB.prepare(
          `UPDATE stock
           SET qty = qty - ?, updated_at=datetime('now')
           WHERE item_id=? AND warehouse_id=? AND qty >= ?`
        ).bind(l.qty, item_id, warehouse_id, l.qty)
      );

      stmts.push(
        env.DB.prepare(
          `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, target, remark, created_by)
           SELECT ?, 'OUT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE (SELECT changes()) > 0`
        ).bind(no, item_id, warehouse_id, l.qty, -l.qty, "BATCH_OUT", null, batch_no, l.target ?? null, l.remark ?? null, user.username)
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
      await env.DB.batch(stmts);
      } catch (e: any) {
      if (String(e?.message || "").includes("JSON path error")) {
        return Response.json({ ok: false, message: "库存不足（可能存在并发出库），本次批量出库已全部回滚" }, { status: 409 });
      }
      throw e;
    }

    // Best-effort audit
    waitUntil(logAudit(env.DB, request, user, "BATCH_OUT", "stock_tx", batch_no, { warehouse_id, count: txs.length }).catch(() => {}));
    return Response.json({ ok: true, batch_no, count: txs.length, txs });
  } catch (e: any) {
    return errorResponse(e);
  }
};
