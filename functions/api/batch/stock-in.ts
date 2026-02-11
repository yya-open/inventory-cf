import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "../_audit";

function batchNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900000 + 100000);
  return `BIN${y}${m}${day}-${rand}`;
}

function txNo() {
  return `IN-${crypto.randomUUID()}`;
}

type Line = {
  sku: string;
  qty: number;
  unit_price?: number;
  source?: string;
  remark?: string;
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const user = await requireAuth(env, request, "operator");

    const body = await request.json();
    const warehouse_id = 1;
    const header_source = body.source ?? null;
    const header_remark = body.remark ?? null;
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
      // already validated
      const key = sku;
      const cur = agg.get(key) ?? { sku, qty: 0 };
      cur.qty += qty;
      cur.unit_price = l.unit_price ?? cur.unit_price;
      cur.source = (l.source ?? header_source ?? cur.source) ?? undefined;
      cur.remark = (l.remark ?? header_remark ?? cur.remark) ?? undefined;
      agg.set(key, cur);
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

    for (const [sku, l] of agg) {
      const item_id = skuToId.get(sku)!;
      const no = txNo();
      txs.push({ tx_no: no, sku, qty: l.qty });

      stmts.push(
        env.DB.prepare(
          `INSERT INTO stock_tx (tx_no, type, item_id, warehouse_id, qty, delta_qty, ref_type, ref_id, ref_no, unit_price, source, remark, created_by)
           VALUES (?, 'IN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(no, item_id, warehouse_id, l.qty, l.qty, "BATCH_IN", null, batch_no, l.unit_price ?? null, l.source ?? null, l.remark ?? null, user.username)
      );

      stmts.push(
        env.DB.prepare(
          `INSERT INTO stock (item_id, warehouse_id, qty, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(item_id, warehouse_id) DO UPDATE SET qty = qty + excluded.qty, updated_at=datetime('now')`
        ).bind(item_id, warehouse_id, l.qty)
      );
    }

    try {
      await env.DB.batch(stmts);
      } catch (e) {
      throw e;
    }

    // Best-effort audit
    waitUntil(logAudit(env.DB, request, user, "BATCH_IN", "stock_tx", batch_no, { warehouse_id, count: txs.length }).catch(() => {}));
    return Response.json({ ok: true, batch_no, count: txs.length, txs });
  } catch (e: any) {
    return errorResponse(e);
  }
};
