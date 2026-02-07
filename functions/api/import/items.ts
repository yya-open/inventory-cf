import { json, requireAuth, errorResponse } from "../_auth";

type ItemRow = {
  sku: string;
  name: string;
  brand?: string;
  model?: string;
  category?: string;
  unit?: string;
  warning_qty?: number;
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  await requireAuth(env, request, "admin");
  const body = await request.json<any>();
  const items: ItemRow[] = Array.isArray(body.items) ? body.items : [];
  const mode = (body.mode || "upsert") as "upsert" | "skip" | "overwrite";

  if (!items.length) return json(false, null, "没有可导入的数据", 400);

  let inserted = 0, updated = 0, skipped = 0;
  const errors: any[] = [];

  await env.DB.exec("BEGIN");
  try {
    for (let i = 0; i < items.length; i++) {
      const r = items[i];
      const sku = (r.sku || "").trim();
      const name = (r.name || "").trim();
      if (!sku || !name) { errors.push({ row: i + 1, message: "SKU/名称必填" }); skipped++; continue; }

      const exists = await env.DB.prepare("SELECT id FROM items WHERE sku=?").bind(sku).first<any>();

      if (exists && mode === "skip") { skipped++; continue; }

      if (exists) {
        await env.DB.prepare(
          "UPDATE items SET name=?, brand=?, model=?, category=?, unit=?, warning_qty=? WHERE sku=?"
        ).bind(
          name,
          r.brand || null,
          r.model || null,
          r.category || null,
          r.unit || "个",
          Number(r.warning_qty || 0),
          sku
        ).run();
        updated++;
      } else {
        await env.DB.prepare(
          "INSERT INTO items (sku, name, brand, model, category, unit, warning_qty) VALUES (?,?,?,?,?,?,?)"
        ).bind(
          sku,
          name,
          r.brand || null,
          r.model || null,
          r.category || null,
          r.unit || "个",
          Number(r.warning_qty || 0)
        ).run();
        inserted++;
      }
    }
    await env.DB.exec("COMMIT");
  } catch (e: any) {
    await env.DB.exec("ROLLBACK");
    return json(false, null, "导入失败：" + (e?.message || "unknown"), 500);
  }

  return json(true, { inserted, updated, skipped, errors });

  } catch (e: any) {
    return errorResponse(e);
  }
};
