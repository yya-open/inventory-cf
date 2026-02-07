import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  const user = await requireAuth(env, request, "viewer");
  const url = new URL(request.url);

  // Optional: fetch by id (for remote selects to resolve label)
  const id = Number(url.searchParams.get("id") || 0);
  if (id) {
    const row = await env.DB.prepare(`SELECT * FROM items WHERE id=?`).bind(id).first<any>();
    if (!row) return Response.json({ ok: true, data: [], total: 0, page: 1, pageSize: 1 });
    return Response.json({ ok: true, data: [row], total: 1, page: 1, pageSize: 1 });
  }
  const keyword = (url.searchParams.get("keyword") || "").trim();

  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
  const offset = (page - 1) * pageSize;

  const sql = keyword
    ? `SELECT * FROM items WHERE enabled=1 AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR model LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?`
    : `SELECT * FROM items WHERE enabled=1 ORDER BY id DESC LIMIT ? OFFSET ?`;

  const binds = keyword ? Array(4).fill(`%${keyword}%`) : [];
  const totalRow = await env.DB.prepare(
    keyword
      ? `SELECT COUNT(*) as c FROM items WHERE enabled=1 AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR model LIKE ?)`
      : `SELECT COUNT(*) as c FROM items WHERE enabled=1`
  ).bind(...binds).first<any>();
  const { results } = await env.DB.prepare(sql).bind(...binds, pageSize, offset).all();

  return Response.json({ ok: true, data: results, total: Number(totalRow?.c || 0), page, pageSize });

  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  const user = await requireAuth(env, request, "admin");
  const body = await request.json();
  const { id, sku, name, brand, model, category, unit, warning_qty } = body;

  let newId: number | null = null;

  if (!sku || !name) return Response.json({ ok: false, message: "sku/name 必填" }, { status: 400 });

  const before = id ? await env.DB.prepare(`SELECT * FROM items WHERE id=?`).bind(id).first<any>() : null;

  if (id) {
    await env.DB.prepare(
      `UPDATE items SET sku=?, name=?, brand=?, model=?, category=?, unit=?, warning_qty=? WHERE id=?`
    ).bind(
      sku,
      name,
      brand || null,
      model || null,
      category || null,
      unit || "个",
      Number(warning_qty || 0),
      id
    ).run();
  } else {
    const ins = await env.DB.prepare(
      `INSERT INTO items (sku, name, brand, model, category, unit, warning_qty) VALUES (?,?,?,?,?,?,?)`
    ).bind(
      sku,
      name,
      brand || null,
      model || null,
      category || null,
      unit || "个",
      Number(warning_qty || 0)
    ).run();
    newId = Number((ins as any)?.meta?.last_row_id || 0) || null;
  }

  const entityId = id || newId;
  await logAudit(env.DB, request, user, id ? 'ITEM_UPDATE' : 'ITEM_CREATE', 'items', entityId, { before, after: { sku, name, brand: brand || null, model: model || null, category: category || null, unit: unit || '个', warning_qty: Number(warning_qty || 0) } });

  return Response.json({ ok: true });

  } catch (e: any) {
    return errorResponse(e);
  }
};
