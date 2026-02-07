import { requireAuth, errorResponse, json } from "../../_auth";
import { logAudit } from "../_audit";
import { requireConfirm } from "../../_confirm";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const body: any = await request.json().catch(() => ({}));

    // Hard protection: require typing 「删除」
    requireConfirm(body, "删除", "二次确认不通过：请输入『删除』");

    const idsRaw = body?.ids ?? (body?.id !== undefined ? [body.id] : []);
    const ids = Array.isArray(idsRaw)
      ? idsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
      : [];

    if (!ids.length) return json(false, null, "缺少 id", 400);
    if (ids.length > 200) return json(false, null, "一次最多删除 200 条", 400);

    const placeholders = ids.map(() => "?").join(",");
    const r = await env.DB.prepare(`DELETE FROM audit_log WHERE id IN (${placeholders})`).bind(...ids).run();
    const deleted = Number((r as any)?.meta?.changes ?? (r as any)?.changes ?? 0);

    // Write an audit entry *after* deletion to record the action.
    // It won't be deleted because it's a new row with a new id.
    await logAudit(env.DB, request, actor, "AUDIT_DELETE", "audit_log", null, { ids, deleted });

    return json(true, { deleted });
  } catch (e: any) {
    return errorResponse(e);
  }
};
