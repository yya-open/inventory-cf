import { requireAuth, errorResponse } from "../_auth";
import { sqlBjDate } from "../_time";

function ymdInShanghai(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  if (!offsetDays) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}


export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");

    const url = new URL(request.url);
    const warehouse_id = Number(url.searchParams.get("warehouse_id") ?? 1);
    const days = Number(url.searchParams.get("days") ?? 30);
    const mode = (url.searchParams.get("mode") || "parts").toLowerCase(); // parts | pc
    const to = url.searchParams.get("to") ?? ymdInShanghai(0);
    const from = url.searchParams.get("from") ?? ymdInShanghai(-(days - 1));

    if (mode === "pc") {
      const sum = await env.DB.prepare(
        `SELECT
           (SELECT COUNT(*) FROM pc_in WHERE ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)) AS in_qty,
           (SELECT COUNT(*) FROM pc_out WHERE ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)) AS out_qty,
           (SELECT COUNT(*) FROM pc_recycle WHERE ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)) AS recycle_qty,
           (SELECT COUNT(*) FROM pc_scrap WHERE ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)) AS scrap_qty,
           (
             (SELECT COUNT(*) FROM pc_in WHERE ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)) +
             (SELECT COUNT(*) FROM pc_out WHERE ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)) +
             (SELECT COUNT(*) FROM pc_recycle WHERE ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)) +
             (SELECT COUNT(*) FROM pc_scrap WHERE ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?))
           ) AS tx_count`
      )
      .bind(from, to, from, to, from, to, from, to, from, to, from, to, from, to, from, to)
      .first() as any;

      const qTopPc = (table: string, whereExtra = "") => env.DB.prepare(
        `SELECT COALESCE(NULLIF(model,''),'(未填型号)') AS sku,
                COALESCE(NULLIF(brand,''),'') || CASE WHEN brand IS NOT NULL AND brand<>'' THEN ' · ' ELSE '' END || COALESCE(NULLIF(serial_no,''),'(无SN)') AS name,
                COUNT(*) AS qty
         FROM ${table}
         WHERE ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?) ${whereExtra}
         GROUP BY COALESCE(NULLIF(model,''),'(未填型号)'), COALESCE(NULLIF(brand,''),''), COALESCE(NULLIF(serial_no,''),'(无SN)')
         ORDER BY qty DESC, MAX(created_at) DESC
         LIMIT 10`
      );
      const qDailyPc = (table: string, whereExtra = "") => env.DB.prepare(
        `SELECT ${sqlBjDate("created_at")} AS day, COUNT(*) AS qty
         FROM ${table}
         WHERE ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?) ${whereExtra}
         GROUP BY day ORDER BY day ASC`
      );
      const qCatPc = (table: string, catExpr: string, whereExtra = "") => env.DB.prepare(
        `SELECT ${catExpr} AS category, COUNT(*) AS qty
         FROM ${table}
         WHERE ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?) ${whereExtra}
         GROUP BY category ORDER BY qty DESC LIMIT 20`
      );

      const { results: topOut } = await qTopPc("pc_out").bind(from, to).all();
      const { results: topIn } = await qTopPc("pc_in").bind(from, to).all();
      const { results: topReturn } = await qTopPc("pc_recycle", "AND UPPER(COALESCE(action,''))='RETURN'").bind(from, to).all();
      const { results: topRecycle } = await qTopPc("pc_recycle", "AND UPPER(COALESCE(action,''))='RECYCLE'").bind(from, to).all();
      const { results: topScrap } = await qTopPc("pc_scrap").bind(from, to).all();

      const { results: dailyOut } = await qDailyPc("pc_out").bind(from, to).all();
      const { results: dailyIn } = await qDailyPc("pc_in").bind(from, to).all();
      const { results: dailyReturn } = await qDailyPc("pc_recycle", "AND UPPER(COALESCE(action,''))='RETURN'").bind(from, to).all();
      const { results: dailyRecycle } = await qDailyPc("pc_recycle", "AND UPPER(COALESCE(action,''))='RECYCLE'").bind(from, to).all();
      const { results: dailyScrap } = await qDailyPc("pc_scrap").bind(from, to).all();

      const { results: catOut } = await qCatPc("pc_out", "COALESCE(NULLIF(department,''),'未填部门')").bind(from, to).all();
      const { results: catIn } = await qCatPc("pc_in", "COALESCE(NULLIF(brand,''),'未填品牌')").bind(from, to).all();
      const { results: catReturn } = await qCatPc("pc_recycle", "COALESCE(NULLIF(department,''),'未填部门')", "AND UPPER(COALESCE(action,''))='RETURN'").bind(from, to).all();
      const { results: catRecycle } = await qCatPc("pc_recycle", "COALESCE(NULLIF(department,''),'未填部门')", "AND UPPER(COALESCE(action,''))='RECYCLE'").bind(from, to).all();
      const { results: catScrap } = await qCatPc("pc_scrap", "COALESCE(NULLIF(reason,''),'未填原因')").bind(from, to).all();

      return Response.json({
        ok: true,
        mode: "pc",
        range: { from, to, days },
        summary: {
          in_qty: Number(sum?.in_qty ?? 0),
          out_qty: Number(sum?.out_qty ?? 0),
          recycle_qty: Number(sum?.recycle_qty ?? 0),
          scrap_qty: Number(sum?.scrap_qty ?? 0),
          adjust_qty: Number(sum?.recycle_qty ?? 0),
          tx_count: Number(sum?.tx_count ?? 0),
        },
        top_out: topOut,
        top_in: topIn,
        top_return: topReturn,
        top_recycle: topRecycle,
        top_scrap: topScrap,
        daily_out: dailyOut,
        daily_in: dailyIn,
        daily_return: dailyReturn,
        daily_recycle: dailyRecycle,
        daily_scrap: dailyScrap,
        category_out: catOut,
        category_in: catIn,
        category_return: catReturn,
        category_recycle: catRecycle,
        category_scrap: catScrap,
      });
    }

    
    const sum = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN type='IN' THEN qty ELSE 0 END) AS in_qty,
         SUM(CASE WHEN type='OUT' THEN qty ELSE 0 END) AS out_qty,
         SUM(CASE WHEN type='ADJUST' THEN qty ELSE 0 END) AS adjust_qty,
         COUNT(*) AS tx_count
       FROM stock_tx
       WHERE warehouse_id=? AND ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)`
    ).bind(warehouse_id, from, to).first() as any;

    const { results: topOut } = await env.DB.prepare(
      `SELECT i.sku, i.name, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='OUT' AND ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?)
       GROUP BY t.item_id
       ORDER BY qty DESC
       LIMIT 10`
    ).bind(warehouse_id, from, to).all();

    const { results: topIn } = await env.DB.prepare(
      `SELECT i.sku, i.name, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='IN' AND ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?)
       GROUP BY t.item_id
       ORDER BY qty DESC
       LIMIT 10`
    ).bind(warehouse_id, from, to).all();

    const { results: dailyOut } = await env.DB.prepare(
      `SELECT ${sqlBjDate("created_at")} AS day, SUM(qty) AS qty
       FROM stock_tx
       WHERE warehouse_id=? AND type='OUT' AND ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)
       GROUP BY day
       ORDER BY day ASC`
    ).bind(warehouse_id, from, to).all();

    const { results: dailyIn } = await env.DB.prepare(
      `SELECT ${sqlBjDate("created_at")} AS day, SUM(qty) AS qty
       FROM stock_tx
       WHERE warehouse_id=? AND type='IN' AND ${sqlBjDate("created_at")} BETWEEN date(?) AND date(?)
       GROUP BY day
       ORDER BY day ASC`
    ).bind(warehouse_id, from, to).all();

    const { results: catOut } = await env.DB.prepare(
      `SELECT COALESCE(i.category,'未分类') AS category, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='OUT' AND ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?)
       GROUP BY category
       ORDER BY qty DESC
       LIMIT 20`
    ).bind(warehouse_id, from, to).all();

    const { results: catIn } = await env.DB.prepare(
      `SELECT COALESCE(i.category,'未分类') AS category, SUM(t.qty) AS qty
       FROM stock_tx t JOIN items i ON i.id=t.item_id
       WHERE t.warehouse_id=? AND t.type='IN' AND ${sqlBjDate("t.created_at")} BETWEEN date(?) AND date(?)
       GROUP BY category
       ORDER BY qty DESC
       LIMIT 20`
    ).bind(warehouse_id, from, to).all();

    return Response.json({
      ok: true,
      mode: "parts",
      range: { from, to, days },
      summary: {
        in_qty: Number(sum?.in_qty ?? 0),
        out_qty: Number(sum?.out_qty ?? 0),
        adjust_qty: Number(sum?.adjust_qty ?? 0),
        tx_count: Number(sum?.tx_count ?? 0),
      },
      top_out: topOut,
      top_in: topIn,
      daily_out: dailyOut,
      daily_in: dailyIn,
      category_out: catOut,
      category_in: catIn,
    });
  } catch (e:any) {
    return errorResponse(e);
  }
};
