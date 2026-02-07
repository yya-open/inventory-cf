import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "../_audit";
import { requireConfirm } from "../_confirm";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");

    const body: any = await request.json().catch(() => ({}));
    const id = Number(body?.id);
    if (!id) return Response.json({ ok: false, message: "缺少盘点单 id" }, { status: 400 });

    // Hard protection: require typing the stocktake id
    requireConfirm(body, String(id), "二次确认不通过：请输入盘点单 ID");

    const st = await env.DB.prepare(`SELECT id, status FROM stocktake WHERE id=?`).bind(id).first() as any;
    if (!st) return Response.json({ ok: false, message: "盘点单不存在" }, { status: 404 });
    if (st.status !== "DRAFT") {
      return Response.json({ ok: false, message: "仅草稿状态可删除；已应用盘点请先撤销" }, { status: 400 });
    }

    // Transaction: delete lines + header together
    const r = await env.DB.batch([
      env.DB.prepare(`DELETE FROM stocktake_line WHERE stocktake_id=?`).bind(id),
      env.DB.prepare(`DELETE FROM stocktake WHERE id=? AND status='DRAFT'`).bind(id),
    ]);

    const changes = Number((r?.[1] as any)?.meta?.changes ?? 0);
    await logAudit(env.DB, request, actor, 'STOCKTAKE_DELETE', 'stocktake', id, { changes });
    return Response.json({ ok: true, changes });
  } catch (e: any) {
    return errorResponse(e);
  }
};
