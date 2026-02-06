import { requireAuth, errorResponse } from "../_auth";

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "viewer");

    const url = new URL(request.url);
    const warehouse_id = Number(url.searchParams.get("warehouse_id") ?? 1);
    const days = Number(url.searchParams.get("days") ?? 30);
    const d = new Date();
    const to = url.searchParams.get("to") ?? d.toISOString().slice(0,10);
    const fromDate = new Date(new Date(to).getTime() - (days-1)*24*3600*1000);
    const from = url.searchParams.get("from") ?? fromDate.toISOString().slice(0,10);

    // summary counts
    const sum = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN type='IN' THEN qty ELSE 0 END) AS in_qty,
         SUM(CASE WHEN type='OUT' THEN qty ELSE 0 END) AS out_qty,
         SUM(CASE WHEN type='ADJUST' THEN qty ELSE 0 END) AS adjust_qty,
         COUNT(*) AS tx_count
       FROM stock_tx
       WHERE warehouse_id=? AND date(created_at) BETWEEN date(?) AND date(?)`
    ).bind(warehouse_id, from, to).first() as any;

    // top out items
    const { results: topOut } = await env.DB.prepare(
      `SELECT i.sku, i.name, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='OUT' AND date(t.created_at) BETWEEN date(?) AND date(?)
       GROUP BY t.item_id
       ORDER BY qty DESC
       LIMIT 10`
    ).bind(warehouse_id, from, to).all();

    // daily series (OUT)
    const { results: dailyOut } = await env.DB.prepare(
      `SELECT date(created_at) AS day, SUM(qty) AS qty
       FROM stock_tx
       WHERE warehouse_id=? AND type='OUT' AND date(created_at) BETWEEN date(?) AND date(?)
       GROUP BY day
       ORDER BY day ASC`
    ).bind(warehouse_id, from, to).all();

    // category out
    const { results: catOut } = await env.DB.prepare(
      `SELECT COALESCE(i.category,'未分类') AS category, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='OUT' AND date(t.created_at) BETWEEN date(?) AND date(?)
       GROUP BY category
       ORDER BY qty DESC
       LIMIT 20`
    ).bind(warehouse_id, from, to).all();

    return Response.json({
      ok: true,
      range: { from, to, days },
      summary: {
        in_qty: Number(sum?.in_qty ?? 0),
        out_qty: Number(sum?.out_qty ?? 0),
        adjust_qty: Number(sum?.adjust_qty ?? 0),
        tx_count: Number(sum?.tx_count ?? 0),
      },
      top_out: topOut,
      daily_out: dailyOut,
      category_out: catOut,
    });
  } catch (e:any) {
    return errorResponse(e);
  }
};
