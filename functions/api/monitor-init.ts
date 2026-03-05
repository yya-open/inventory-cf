import { requireAuth, errorResponse } from "../_auth";
import { logAudit } from "./_audit";
import { ensureMonitorSchema } from "./_monitor";

// 手动初始化（显示器相关表 + 位置表）
// 用于：生产环境忘记跑迁移时快速自愈。
// 仅 admin 可用，且需要二次确认 confirm=初始化。
export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuth(env, request, "admin");
    if (!env.DB) return Response.json({ ok: false, message: "未绑定 D1 数据库(DB)" }, { status: 500 });

    const body = await request.json<any>().catch(() => ({} as any));
    const confirm = String(body?.confirm || "").trim();
    if (confirm !== "初始化") {
      return Response.json({ ok: false, message: "需要二次确认：confirm=初始化" }, { status: 400 });
    }

    await ensureMonitorSchema(env.DB);
    await logAudit(env.DB, request, user, "monitor_schema_init", "schema", "monitor", { ok: true });
    return Response.json({ ok: true, message: "初始化完成" });
  } catch (e: any) {
    return errorResponse(e);
  }
};
