import { requireAuth, errorResponse, json } from "../../_auth";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    if (!env.DB) return json(false, null, "未绑定 D1 数据库(DB)");

    const body = await request.json<any>();
    const item_ids: number[] = Array.isArray(body?.item_ids) ? body.item_ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)) : [];
    const warning_qty = Number(body?.warning_qty);

    if (!item_ids.length) return Response.json({ ok: false, message: "item_ids 不能为空" }, { status: 400 });
    if (!Number.isFinite(warning_qty) || warning_qty < 0) return Response.json({ ok: false, message: "warning_qty 必须是 >=0 的数字" }, { status: 400 });

    // Build placeholders
    const placeholders = item_ids.map(() => "?").join(",");
    const sql = `UPDATE items SET warning_qty=? WHERE id IN (${placeholders})`;
    const binds = [warning_qty, ...item_ids];

    const r = await env.DB.prepare(sql).bind(...binds).run();
    return Response.json({ ok: true, updated: r.meta?.changes ?? item_ids.length });
  } catch (e: any) {
    return errorResponse(e);
  }
};
