import { requireAuth, errorResponse, json } from "../../../_auth";
import { logAudit } from "../../_audit";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const { id } = await request.json<any>();
    const jobId = String(id || "").trim();
    if (!jobId) return Response.json({ ok: false, message: "缺少 id" }, { status: 400 });

    const job = await env.DB.prepare(`SELECT status FROM restore_job WHERE id=?`).bind(jobId).first<any>();
    if (!job) return Response.json({ ok: false, message: "任务不存在" }, { status: 404 });

    if (job.status === "DONE") return json(true, { id: jobId, status: "DONE" });

    // “取消”这里等同于暂停（可续跑）
    await env.DB.prepare(`UPDATE restore_job SET status='PAUSED', updated_at=datetime('now') WHERE id=? AND status!='DONE'`)
      .bind(jobId)
      .run();

    waitUntil(logAudit(env.DB, request, actor, "ADMIN_RESTORE_JOB_PAUSE", "restore_job", jobId, {}).catch(() => {}));
    return json(true, { id: jobId, status: "PAUSED" });
  } catch (e: any) {
    return errorResponse(e);
  }
};
