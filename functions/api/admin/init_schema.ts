import { requireAuth, errorResponse, json } from "../../_auth";
import { ensureCoreSchema } from "../_schema";
import { ensurePcSchema } from "../_pc";
import { ensureMonitorSchema } from "../_monitor";
import { logAudit } from "../_audit";

// POST /api/admin/init_schema
// Admin-only. Best-effort create/upgrade ALL tables/columns used by this app.
// Body: { confirm: "初始化" }
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const body = await request.json<any>().catch(() => ({}));
    if (String(body?.confirm || "").trim() !== "初始化") {
      return json(false, null, "需要二次确认：confirm=初始化", 400);
    }

    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);

    waitUntil(
      logAudit(env.DB, {
        user_id: actor.id,
        username: actor.username,
        action: "admin.init_schema",
        entity: "schema",
        entity_id: "all",
        payload_json: JSON.stringify({ ok: true }),
        ip: actor.ip,
        ua: actor.ua,
      }).catch(() => {})
    );

    return json(true, { ok: true });
  } catch (e: any) {
    return errorResponse(e);
  }
};
