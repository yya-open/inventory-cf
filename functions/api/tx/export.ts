import { requireAuth, errorResponse } from "../../_auth";
import { logAudit } from "../_audit";
import { toSqlRange } from "../_date";

/**
 * GET /api/tx/export
 * Export stock_tx as CSV (UTF-8 with BOM) generated on the backend.
 * Designed for large exports: reads rows page-by-page and streams CSV.
 */
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "viewer");
    const url = new URL(request.url);
    const type = (url.searchParams.get("type") || "").trim();
    const item_id = url.searchParams.get("item_id");
    const date_from = url.searchParams.get("date_from");
    const date_to = url.searchParams.get("date_to");

    // Safety: cap rows
    const maxRows = Math.min(100000, Math.max(1000, Number(url.searchParams.get("max") || 50000)));
    const pageSize = 1000;

    const wh: string[] = [];
    const bindsBase: any[] = [];

    // 配件仓固定主仓(id=1)
    wh.push(`t.warehouse_id=?`);
    bindsBase.push(1);
    if (type) {
      wh.push(`t.type=?`);
      bindsBase.push(type);
    }
    if (item_id) {
      wh.push(`t.item_id=?`);
      bindsBase.push(Number(item_id));
    }
    const fromSql = toSqlRange(date_from, false);
    const toSql = toSqlRange(date_to, true);
    if (fromSql) {
      wh.push(`t.created_at >= ?`);
      bindsBase.push(fromSql);
    }
    if (toSql) {
      wh.push(`t.created_at <= ?`);
      bindsBase.push(toSql);
    }

    // Best-effort audit (do not block export stream)
    waitUntil(
      logAudit(env.DB, request, actor, "TX_EXPORT", "stock_tx", null, {
        type: type || null,
        item_id: item_id ? Number(item_id) : null,
        date_from: date_from || null,
        date_to: date_to || null,
        max: maxRows,
      }).catch(() => {})
    );

    // Keyset pagination to avoid OFFSET on large tables
    let lastId = Number.MAX_SAFE_INTEGER;
    wh.push(`t.id < ?`);

    const where = `WHERE ${wh.join(" AND ")}`;
    const sql = `
      SELECT t.id, t.created_at, t.tx_no, t.type, t.qty, t.delta_qty, t.source, t.target, t.remark,
             i.sku, i.name, w.name as warehouse_name
      FROM stock_tx t
      JOIN items i ON i.id=t.item_id
      JOIN warehouses w ON w.id=t.warehouse_id
      ${where}
      ORDER BY t.id DESC
      LIMIT ?
    `;

    const toCsvCell = (v: any) => {
      const s = String(v ?? "");
      return `"${s.replace(/"/g, '""')}"`;
    };

    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    const filename = `stock_tx_${y}${m}${d}.csv`;

    const header = ["时间", "单号", "类型", "SKU", "名称", "仓库", "数量", "变动", "来源", "去向", "备注"];

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Stream writer (fire-and-forget)
    (async () => {
      try {
        // UTF-8 BOM for Excel
        await writer.write(new TextEncoder().encode("\ufeff" + header.map(toCsvCell).join(",") + "\n"));

        let written = 0;
        while (written < maxRows) {
          const binds = [...bindsBase, lastId, pageSize];
          const { results } = await env.DB.prepare(sql).bind(...binds).all<any>();
          const rows = (results || []) as any[];
          if (!rows.length) break;

          for (const r of rows) {
            const delta = typeof r.delta_qty === "number" ? r.delta_qty : 0;
            const line = [
              r.created_at,
              r.tx_no,
              r.type,
              r.sku,
              r.name,
              r.warehouse_name,
              r.qty,
              delta,
              r.source || "",
              r.target || "",
              r.remark || "",
            ]
              .map(toCsvCell)
              .join(",")
              .concat("\n");
            await writer.write(new TextEncoder().encode(line));
            written += 1;
            if (written >= maxRows) break;
          }

          lastId = Number(rows[rows.length - 1].id);
          if (!lastId) break;
          if (rows.length < pageSize) break;
        }
      } catch {
        // ignore streaming errors
      } finally {
        try {
          await writer.close();
        } catch {}
      }
    })();

    return new Response(readable, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
