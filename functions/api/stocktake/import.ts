import { requireAuth, errorResponse } from "../_auth";

type Line = { sku: string; counted_qty: number };

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, \"admin\");

    const body = await request.json();
    const id = Number(body.id);
    const lines: Line[] = Array.isArray(body.lines) ? body.lines : [];
    if (!id) return Response.json({ ok:false, message:"缺少盘点单 id" }, { status:400 });
    if (!lines.length) return Response.json({ ok:false, message:"没有导入明细" }, { status:400 });

    const st = await env.DB.prepare(`SELECT id, status FROM stocktake WHERE id=?`).bind(id).first() as any;
    if (!st) return Response.json({ ok:false, message:"盘点单不存在" }, { status:404 });
    if (st.status !== "DRAFT") return Response.json({ ok:false, message:"盘点单已应用，不能再导入" }, { status:400 });

    const skus = Array.from(new Set(lines.map(l=>String(l.sku??"").trim()).filter(Boolean)));
    if (!skus.length) return Response.json({ ok:false, message:"SKU 为空" }, { status:400 });

    const placeholders = skus.map(()=>"?").join(",");
    const { results } = await env.DB.prepare(`SELECT id, sku FROM items WHERE sku IN (${placeholders})`).bind(...skus).all();
    const skuToId = new Map<string, number>();
    for (const r of results as any[]) skuToId.set(r.sku, r.id);

    const stmts: D1PreparedStatement[] = [];
    let updated = 0;
    const unknown: string[] = [];

    for (const l of lines) {
      const sku = String(l.sku ?? "").trim();
      if (!sku) continue;
      const item_id = skuToId.get(sku);
      if (!item_id) { unknown.push(sku); continue; }
      const counted = Number(l.counted_qty);
      if (Number.isNaN(counted) || counted < 0) continue;

      // update counted and diff
      stmts.push(env.DB.prepare(
        `UPDATE stocktake_line
         SET counted_qty=?, diff_qty=(? - system_qty), updated_at=datetime('now')
         WHERE stocktake_id=? AND item_id=?`
      ).bind(counted, counted, id, item_id));
      updated++;
    }

    if (stmts.length) await env.DB.batch(stmts);
    return Response.json({ ok:true, updated, unknown });
  } catch (e:any) {
    return errorResponse(e);
  }
};
