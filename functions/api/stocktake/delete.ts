import { requireAuth, errorResponse } from "../_auth";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");

    const body: any = await request.json().catch(() => ({}));
    const id = Number(body?.id);
    if (!id) return Response.json({ ok: false, message: "缺少盘点单 id" }, { status: 400 });

    const st = await env.DB.prepare(`SELECT id, status FROM stocktake WHERE id=?`).bind(id).first() as any;
    if (!st) return Response.json({ ok: false, message: "盘点单不存在" }, { status: 404 });
    if (st.status !== "DRAFT") {
      return Response.json({ ok: false, message: "仅草稿状态可删除；已应用盘点请先撤销" }, { status: 400 });
    }

    // delete lines first
    await env.DB.prepare(`DELETE FROM stocktake_line WHERE stocktake_id=?`).bind(id).run();
    const r = await env.DB.prepare(`DELETE FROM stocktake WHERE id=? AND status='DRAFT'`).bind(id).run();

    return Response.json({ ok: true, changes: (r as any)?.meta?.changes ?? 0 });
  } catch (e: any) {
    return errorResponse(e);
  }
};
