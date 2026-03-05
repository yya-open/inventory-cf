import { requireAuth, errorResponse } from "../../_auth";
import { logAudit } from "../_audit";
import { ensureMonitorSchemaIfAllowed } from "../_monitor";

// POST /api/monitor-inventory-log/delete
// Admin-only. Deletes monitor_inventory_log rows by id(s).
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const url = new URL(request.url);
    await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const body = await request.json<any>().catch(() => ({} as any));
    const confirm = String(body?.confirm || "").trim();
    if (confirm !== "删除") {
      return Response.json({ ok: false, message: "需要二次确认：confirm=删除" }, { status: 400 });
    }

    const ids = (body?.ids || [])
      .map((x: any) => Number(x))
      .filter((n: number) => Number.isFinite(n) && n > 0);

    if (!ids.length) {
      return Response.json({ ok: false, message: "缺少 ids" }, { status: 400 });
    }

    const placeholders = ids.map(() => "?").join(",");
    const r = await env.DB.prepare(`DELETE FROM monitor_inventory_log WHERE id IN (${placeholders})`).bind(...ids).run();

    await logAudit(env.DB, request, actor, "monitor_inventory_log_delete", "monitor_inventory_log", null, {
      ids,
      deleted: (r as any)?.meta?.changes ?? null,
    });

    return Response.json({ ok: true, data: { deleted: (r as any)?.meta?.changes ?? 0 } });
  } catch (e: any) {
    return errorResponse(e);
  }
};
