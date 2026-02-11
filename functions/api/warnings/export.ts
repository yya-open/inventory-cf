import { requireAuth, errorResponse, json } from "../../_auth";
import { buildKeywordWhere } from "../_search";

function csvEscape(v: any) {
  const s = (v ?? "").toString();
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function getSort(sqlKey: string) {
  switch (sqlKey) {
    case "gap_asc":
      return "gap ASC, qty ASC, i.id DESC";
    case "qty_asc":
      return "qty ASC, gap DESC, i.id DESC";
    case "sku_asc":
      return "i.sku ASC, i.id DESC";
    case "name_asc":
      return "i.name ASC, i.id DESC";
    case "gap_desc":
    default:
      return "gap DESC, qty ASC, i.id DESC";
  }
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return json(false, null, "未绑定 D1 数据库(DB)");

    const url = new URL(request.url);
    const warehouse_id = 1; // 配件仓固定主仓
    const category = (url.searchParams.get("category") || "").trim();
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const only_alert = (url.searchParams.get("only_alert") ?? "1") !== "0";
    const sort = (url.searchParams.get("sort") || "gap_desc").trim();

    const whereParts: string[] = ["i.enabled=1"];
    const binds: any[] = [warehouse_id];

    if (only_alert) {
      whereParts.push("COALESCE(s.qty,0) <= COALESCE(i.warning_qty,0)");
    }

    if (category) {
      whereParts.push("i.category = ?");
      binds.push(category);
    }

    if (keyword) {
      const kw = buildKeywordWhere(keyword, {
        numericId: "i.id",
        exact: ["i.sku"],
        prefix: ["i.sku", "i.name"],
        contains: ["i.name", "i.brand", "i.model"],
      });
      if (kw.sql) {
        whereParts.push(kw.sql);
        binds.push(...kw.binds);
      }
    }

    const orderBy = getSort(sort);

    const sql = `
      SELECT
        i.sku, i.name, i.brand, i.model, i.category,
        COALESCE(s.qty,0) as qty,
        COALESCE(i.warning_qty,0) as warning_qty,
        (COALESCE(i.warning_qty,0) - COALESCE(s.qty,0)) as gap,
        (
          SELECT MAX(tx.created_at)
          FROM stock_tx tx
          WHERE tx.warehouse_id = ? AND tx.item_id = i.id
        ) as last_tx_at
      FROM items i
      LEFT JOIN stock s ON s.item_id=i.id AND s.warehouse_id=?
      WHERE ${whereParts.join(" AND ")}
      ORDER BY ${orderBy}
    `;
    // bind order: last_tx warehouse_id, stock join warehouse_id, then filters
    const bindAll = [warehouse_id, ...binds];
    const { results } = await env.DB.prepare(sql).bind(...bindAll).all();

    // fetch warehouse name
    const w = await env.DB.prepare("SELECT name FROM warehouses WHERE id=?").bind(warehouse_id).first<{ name: string }>();
    const warehouseName = w?.name || `仓库#${warehouse_id}`;

    const header = ["仓库", "SKU", "名称", "品牌", "型号", "分类", "库存", "预警值", "缺口(预警-库存)", "最后变动时间"];
    const lines: string[] = [];
    lines.push(header.join(","));
    for (const r of (results as any[])) {
      lines.push(
        [
          csvEscape(warehouseName),
          csvEscape(r.sku),
          csvEscape(r.name),
          csvEscape(r.brand),
          csvEscape(r.model),
          csvEscape(r.category),
          csvEscape(r.qty),
          csvEscape(r.warning_qty),
          csvEscape(r.gap),
          csvEscape(r.last_tx_at),
        ].join(",")
      );
    }

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const filename = `warnings_${y}${m}${d}.csv`;

    // Add UTF-8 BOM for Excel compatibility
    const csvText = "\ufeff" + lines.join("\n");
    return new Response(csvText, {
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
