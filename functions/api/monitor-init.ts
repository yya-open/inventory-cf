import { requireAuth } from "../_auth";
import { withErrorHandling } from './_error';
import { logAudit } from "./_audit";
import { ensureMonitorSchema } from "./_monitor";

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const user = await requireAuth(env, request, "admin");
  if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

  const body = await request.json().catch(() => ({} as any));
  const confirm = String(body?.confirm || "").trim();
  if (confirm !== "初始化") {
    return Response.json({ ok: false, message: "需要二次确认：confirm=初始化" }, { status: 400 });
  }

  await ensureMonitorSchema(env.DB);
  await logAudit(env.DB, request, user, "MONITOR_SCHEMA_INIT", "schema", "monitor", { ok: true });
  return Response.json({ ok: true, message: "初始化完成" });
});
