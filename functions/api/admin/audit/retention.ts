import { requireAuth, errorResponse, json } from "../../../_auth";
import { getAuditRetention, setAuditRetention, runAuditCleanup } from "../../_audit";

type Env = { DB: D1Database; JWT_SECRET: string };

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    const st = await getAuditRetention(env.DB);
    return json(true, st);
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    const body = await request.json<any>().catch(() => ({}));
    const retention_days = Number(body?.retention_days);
    if (!retention_days || !Number.isFinite(retention_days)) {
      return json(false, null, "retention_days 无效", 400);
    }

    const days = await setAuditRetention(env.DB, retention_days);

    // optional immediate cleanup, requires confirm word
    if (body?.run_cleanup) {
      const confirm = String(body?.confirm || "").trim();
      if (confirm !== "清理") {
        return json(false, null, "请在 confirm 中输入：清理", 400);
      }
      const r = await runAuditCleanup(env.DB);
      return json(true, { retention_days: days, ...r });
    }

    const st = await getAuditRetention(env.DB);
    return json(true, st);
  } catch (e: any) {
    return errorResponse(e);
  }
};
