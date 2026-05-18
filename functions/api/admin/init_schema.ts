import { requireAuth, json } from "../../_auth";
import { withErrorHandling } from "../../_error";
import { ensureCoreSchema } from "../_schema";
import { ensurePcSchema } from "../_pc";
import { ensureMonitorSchema } from "../_monitor";
import { logAudit } from "../_audit";

// POST /api/admin/init_schema
// Admin-only. Best-effort create/upgrade ALL tables/columns used by this app.
// Body: { confirm: "初始化" }
export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request, waitUntil }) => {
  const actor = await requireAuth(env, request, "admin");
  const body = await request.json().catch(() => ({}));
  if (String(body?.confirm || "").trim() !== "初始化") {
    return json(false, null, "需要二次确认：confirm=初始化", 400);
  }

  await ensureCoreSchema(env.DB);
  await ensurePcSchema(env.DB);
  await ensureMonitorSchema(env.DB);

  waitUntil(
    logAudit(env.DB, request, actor, "ADMIN_INIT_SCHEMA", "schema", "all", { ok: true }).catch(() => {})
  );

  return json(true, { ok: true });
});
