import { requireAuth, errorResponse, json } from "../../_auth";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    if (!env.DB) return json(false, null, "未绑定 D1 数据库(DB)");

    const body = await request.json<any>();
    const item_ids: number[] = Array.isArray(body?.item_ids) ? body.item_ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)) : [];
    const mode = String(body?.mode || "set");
    const warehouse_id = Number(body?.warehouse_id || 1);
    const warning_qty = Number(body?.warning_qty);
    const delta = Number(body?.delta);

    if (!item_ids.length) return Response.json({ ok: false, message: "item_ids 不能为空" }, { status: 400 });
    if (mode === "set") {
      if (!Number.isFinite(warning_qty) || warning_qty < 0) return Response.json({ ok: false, message: "warning_qty 必须是 >=0 的数字" }, { status: 400 });
    } else if (mode === "add") {
      if (!Number.isFinite(delta)) return Response.json({ ok: false, message: "delta 必须是数字" }, { status: 400 });
    } else if (mode === "qty_plus") {
      if (!Number.isFinite(delta) || delta < 0) return Response.json({ ok: false, message: "delta 必须是 >=0 的数字" }, { status: 400 });
      if (!Number.isFinite(warehouse_id) || warehouse_id <= 0) return Response.json({ ok: false, message: "warehouse_id 不合法" }, { status: 400 });
    } else {
      return Response.json({ ok: false, message: "mode 不支持" }, { status: 400 });
    }

    // Build placeholders
    const placeholders = item_ids.map(() => "?").join(",");

    let sql = "";
    let binds: any[] = [];

    if (mode === "set") {
      sql = `UPDATE items SET warning_qty=? WHERE id IN (${placeholders})`;
      binds = [warning_qty, ...item_ids];
    } else if (mode === "add") {
      // Increase warning_qty by delta (supports negative delta)
      sql = `UPDATE items SET warning_qty=MAX(0, COALESCE(warning_qty,0) + ?) WHERE id IN (${placeholders})`;
      binds = [delta, ...item_ids];
    } else if (mode === "qty_plus") {
      // Set warning_qty = current stock qty (in given warehouse) + delta
      sql = `
        UPDATE items
        SET warning_qty = (
          COALESCE((SELECT qty FROM stock s WHERE s.item_id = items.id AND s.warehouse_id = ?), 0) + ?
        )
        WHERE id IN (${placeholders})
      `;
      binds = [warehouse_id, delta, ...item_ids];
    }

    const r = await env.DB.prepare(sql).bind(...binds).run();
    return Response.json({ ok: true, updated: r.meta?.changes ?? item_ids.length });
  } catch (e: any) {
    return errorResponse(e);
  }
};
