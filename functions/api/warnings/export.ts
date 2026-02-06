import { requireAuth, errorResponse, json } from "../../_auth";

function csvEscape(v: any) {
  const s = (v ?? "").toString();
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "viewer");
    if (!env.DB) return json(false, null, "未绑定 D1 数据库(DB)");

    const url = new URL(request.url);
    const warehouse_id = Number(url.searchParams.get("warehouse_id") || 1);
    const category = (url.searchParams.get("category") || "").trim();
    const keyword = (url.searchParams.get("keyword") || "").trim();

    const whereParts: string[] = ["i.enabled=1", "COALESCE(s.qty,0) <= i.warning_qty"];
    const binds: any[] = [warehouse_id];

    if (category) {
      whereParts.push("i.category = ?");
      binds.push(category);
    }

    if (keyword) {
      whereParts.push("(i.name LIKE ? OR i.sku LIKE ? OR i.brand LIKE ? OR i.model LIKE ?)");
      const like = `%${keyword}%`;
      binds.push(like, like, like, like);
    }

    const sql = `
      SELECT
        i.sku, i.name, i.brand, i.model, i.category,
        COALESCE(s.qty,0) as qty,
        i.warning_qty as warning_qty,
        (i.warning_qty - COALESCE(s.qty,0)) as need_qty
      FROM items i
      LEFT JOIN stock s ON s.item_id=i.id AND s.warehouse_id=?
      WHERE ${whereParts.join(" AND ")}
      ORDER BY need_qty DESC, i.id DESC
    `;
    const { results } = await env.DB.prepare(sql).bind(...binds).all();

    // fetch warehouse name
    const w = await env.DB.prepare("SELECT name FROM warehouses WHERE id=?").bind(warehouse_id).first<{ name: string }>();
    const warehouseName = w?.name || `仓库#${warehouse_id}`;

    const header = ["仓库", "SKU", "名称", "品牌", "型号", "分类", "库存", "预警值", "建议补货"];
    const lines: string[] = [];
    lines.push(header.join(","));
    for (const r of (results as any[])) {
      const need = Math.max(Number(r.need_qty || 0), 0);
      lines.push([
        csvEscape(warehouseName),
        csvEscape(r.sku),
        csvEscape(r.name),
        csvEscape(r.brand),
        csvEscape(r.model),
        csvEscape(r.category),
        csvEscape(r.qty),
        csvEscape(r.warning_qty),
        csvEscape(need),
      ].join(","));
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
