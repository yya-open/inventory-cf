import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  const user = await requireAuth(env, request, "viewer");
  const url = new URL(request.url);
  const keyword = (url.searchParams.get("keyword") || "").trim();

  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
  const offset = (page - 1) * pageSize;
  const withTotal = (url.searchParams.get("with_total") ?? "1") === "1";

  const sql = keyword
    ? `SELECT * FROM items WHERE enabled=1 AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR model LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?`
    : `SELECT * FROM items WHERE enabled=1 ORDER BY id DESC LIMIT ? OFFSET ?`;

  const binds = keyword ? Array(4).fill(`%${keyword}%`) : [];
  const totalRow = withTotal ? await env.DB.prepare(
    keyword
      ? `SELECT COUNT(*) as c FROM items WHERE enabled=1 AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR model LIKE ?)`
      : `SELECT COUNT(*) as c FROM items WHERE enabled=1`
  ).bind(...binds).first<any>() : null;
  const { results } = await env.DB.prepare(sql).bind(...binds, pageSize, offset).all();

  return Response.json({ ok: true, data: results, total: withTotal ? Number((totalRow as any)?.c || 0) : null, page, pageSize });

  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  const user = await requireAuth(env, request, "admin");
  const body = await request.json();
  const { id, sku, name, brand, model, category, unit, warning_qty } = body;

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
    const newId = (ins as any)?.meta?.last_row_id;
  }

  const entityId = id || (typeof newId !== 'undefined' ? newId : null);
  await logAudit(env.DB, request, user, id ? 'ITEM_UPDATE' : 'ITEM_CREATE', 'items', entityId, { before, after: { sku, name, brand: brand || null, model: model || null, category: category || null, unit: unit || '个', warning_qty: Number(warning_qty || 0) } });

  return Response.json({ ok: true });

  } catch (e: any) {
    return errorResponse(e);
  }
};


export const onRequestDelete: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "admin");
    const body = await request.json<any>().catch(() => ({}));
    const id = Number(body?.id);
    if (!id) return Response.json({ ok: false, message: "id 无效" }, { status: 400 });

    const before = await env.DB.prepare(`SELECT * FROM items WHERE id=?`).bind(id).first<any>();
    if (!before) return Response.json({ ok: false, message: "配件不存在" }, { status: 404 });

    // 软删除：列表只显示 enabled=1，因此这里置 0，历史数据保留
    await env.DB.prepare(`UPDATE items SET enabled=0 WHERE id=?`).bind(id).run();

    await logAudit(env.DB, request, user, "ITEM_DELETE", "items", id, { before });

    return Response.json({ ok: true });
  } catch (e: any) {
    return errorResponse(e);
  }
};

