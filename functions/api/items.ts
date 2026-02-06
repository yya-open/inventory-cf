export const onRequestGet: PagesFunction<{ DB: D1Database }> = async ({ env, request }) => {
  const url = new URL(request.url);
  const keyword = (url.searchParams.get("keyword") || "").trim();

  const sql = keyword
    ? `SELECT * FROM items WHERE enabled=1 AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR model LIKE ?) ORDER BY id DESC`
    : `SELECT * FROM items WHERE enabled=1 ORDER BY id DESC`;

  const binds = keyword ? Array(4).fill(`%${keyword}%`) : [];
  const { results } = await env.DB.prepare(sql).bind(...binds).all();

  return Response.json({ ok: true, data: results });
};

export const onRequestPost: PagesFunction<{ DB: D1Database }> = async ({ env, request }) => {
  const body = await request.json();
  const { id, sku, name, brand, model, category, unit, warning_qty } = body;

  if (!sku || !name) return Response.json({ ok: false, message: "sku/name 必填" }, { status: 400 });

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
    await env.DB.prepare(
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
  }

  return Response.json({ ok: true });
};
