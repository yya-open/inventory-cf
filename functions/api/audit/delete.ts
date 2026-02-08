import { requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";

// POST /api/audit/delete
// Admin-only. Deletes audit_log rows by id(s).
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const body: any = await request.json().catch(() => ({}));

    const idsRaw = body?.ids ?? (body?.id !== undefined ? [body.id] : []);
    const ids = Array.isArray(idsRaw)
      ? idsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
      : [];

    // Server-side hard confirm to prevent accidental destructive actions
    requireConfirm(body, "删除", "二次确认不通过");

    if (!ids.length) {
      return Response.json({ ok: false, message: "缺少 id" }, { status: 400 });
    }
    if (ids.length > 200) {
      return Response.json({ ok: false, message: "一次最多删除 200 条" }, { status: 400 });
    }

    const placeholders = ids.map(() => "?").join(",");
    const r = await env.DB.prepare(`DELETE FROM audit_log WHERE id IN (${placeholders})`).bind(...ids).run();
    const deleted = Number((r as any)?.meta?.changes ?? (r as any)?.changes ?? 0);

    // Best-effort audit; do not block the delete request
    waitUntil(
      logAudit(env.DB, request, actor, "AUDIT_DELETE", "audit_log", null, {
        ids,
        deleted,
      }).catch(() => {})
    );

    return Response.json({ ok: true, data: { deleted } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
