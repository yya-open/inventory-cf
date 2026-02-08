import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { buildKeywordWhere } from "./_search";
export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
  const user = await requireAuth(env, request, "viewer");
  const url = new URL(request.url);
  const keyword = (url.searchParams.get("keyword") || "").trim();

  const sortByRaw = (url.searchParams.get("sort_by") || "id").trim();
  const sortDirRaw = (url.searchParams.get("sort_dir") || "desc").trim().toLowerCase();
  const sortDir = sortDirRaw === "asc" ? "ASC" : "DESC";
  const sortMap: Record<string, string> = {
    id: "id",
    sku: "sku",
    name: "name",
    brand: "brand",
    model: "model",
    category: "category",
    warning_qty: "warning_qty",
    created_at: "created_at",
  };
  const sortCol = sortMap[sortByRaw] || "id";
  const orderBy = `${sortCol} ${sortDir}, id DESC`;

  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(200, Math.max(20, Number(url.searchParams.get("page_size") || 50)));
  const offset = (page - 1) * pageSize;

  const kw = buildKeywordWhere(keyword, {
    numericId: "id",
    exact: ["sku"],
    prefix: ["sku", "name"],
    contains: ["name", "brand", "model"],
  });
  const where = kw.sql ? `WHERE enabled=1 AND ${kw.sql}` : `WHERE enabled=1`;
  const binds = kw.binds;

  const totalRow = await env.DB.prepare(`SELECT COUNT(*) as c FROM items ${where}`).bind(...binds).first<any>();
  const sql = `SELECT * FROM items ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  const { results } = await env.DB.prepare(sql).bind(...binds, pageSize, offset).all();

  return Response.json({ ok: true, data: results, total: Number(totalRow?.c || 0), page, pageSize, keyword_mode: kw.mode, sort_by: sortByRaw, sort_dir: sortDirRaw });

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
  let newId: number | null = null;

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
    const last = (ins as any)?.meta?.last_row_id;
    newId = (typeof last === "number") ? last : (last ? Number(last) : null);
  }

  const entityId = id ? Number(id) : newId;
  const after = entityId
    ? await env.DB.prepare(`SELECT * FROM items WHERE id=?`).bind(entityId).first<any>()
    : { sku, name, brand: brand || null, model: model || null, category: category || null, unit: unit || "个", warning_qty: Number(warning_qty || 0) };

  await logAudit(
    env.DB,
    request,
    user,
    id ? "ITEM_UPDATE" : "ITEM_CREATE",
    "items",
    entityId,
    { before, after }
  );

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

