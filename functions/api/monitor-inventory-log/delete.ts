import { requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";
import { ensureMonitorSchemaIfAllowed } from "../_monitor";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    requireConfirm(body, "删除", "二次确认不通过");

    const idsRaw = body?.ids ?? (body?.id !== undefined ? [body.id] : []);
    const ids = Array.isArray(idsRaw)
      ? idsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
      : [];

    if (!ids.length) return Response.json({ ok: false, message: "缺少 ids" }, { status: 400 });
    if (ids.length > 200) return Response.json({ ok: false, message: "一次最多删除 200 条" }, { status: 400 });

    const placeholders = ids.map(() => "?").join(",");
    const r = await env.DB.prepare(`DELETE FROM monitor_inventory_log WHERE id IN (${placeholders})`).bind(...ids).run();
    const deleted = Number((r as any)?.meta?.changes ?? 0);

    await logAudit(env.DB, request, actor, "MONITOR_INVENTORY_LOG_DELETE", "monitor_inventory_log", null, { ids, deleted });
    return Response.json({ ok: true, data: { deleted } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
