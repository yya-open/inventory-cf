import { requireAuth, errorResponse, json } from "../../../_auth";
import { getAuditLifecycle, runAuditCleanup, setAuditLifecycle } from "../../_audit";
import { createAuditArchiveJob, getAuditArchiveAdminSummary } from "../../services/audit-archive";
import { dispatchAsyncJobIds } from '../../services/async-job-queue';

type Env = { DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET?: any; ASYNC_JOB_QUEUE?: any };

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, "admin");
    const st = await getAuditArchiveAdminSummary(env.DB);
    return json(true, st);
  } catch (e: any) {
    return errorResponse(e);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");
    const body = await request.json<any>().catch(() => ({}));
    const retentionDays = Number(body?.retention_days);
    if (!retentionDays || !Number.isFinite(retentionDays)) {
      return json(false, null, "retention_days 无效", 400);
    }

    const st = await setAuditLifecycle(env.DB, {
      retention_days: retentionDays,
      archive_enabled: body?.archive_enabled,
      archive_after_days: Number(body?.archive_after_days || 0) || undefined,
      delete_after_archive: body?.delete_after_archive,
      max_archive_rows: Number(body?.max_archive_rows || 0) || undefined,
      warn_db_size_mb: Number(body?.warn_db_size_mb || 0) || undefined,
      warn_audit_rows: Number(body?.warn_audit_rows || 0) || undefined,
      warn_audit_bytes_mb: Number(body?.warn_audit_bytes_mb || 0) || undefined,
    });

    if (body?.run_cleanup) {
      const confirm = String(body?.confirm || "").trim();
      if (confirm !== "清理") {
        return json(false, null, "请在 confirm 中输入：清理", 400);
      }
      const r = await runAuditCleanup(env.DB, { force: true, maxRows: Number(body?.cleanup_max_rows || 0) || undefined });
      return json(true, { ...st, cleanup_result: r });
    }

    if (body?.run_archive) {
      const confirm = String(body?.archive_confirm || body?.confirm || '').trim();
      if (confirm !== '归档') return json(false, null, '请在 archive_confirm 中输入：归档', 400);
      if (!env.BACKUP_BUCKET) return json(false, null, '未绑定 R2：BACKUP_BUCKET。请先绑定对象存储', 500);
      const created = await createAuditArchiveJob(env.DB, {
        created_by: actor.id,
        created_by_name: actor.username,
        archive_after_days: Number(body?.archive_after_days || 0) || st.archive_after_days,
        max_rows: Number(body?.max_archive_rows || 0) || st.max_archive_rows,
        delete_after_export: body?.delete_after_archive ?? st.delete_after_archive,
        retain_days: Number(body?.retain_days || 30) || 30,
        reason: 'manual_audit_archive',
      }, env.BACKUP_BUCKET);
      await dispatchAsyncJobIds({ db: env.DB, ids: [created.id], queue: env.ASYNC_JOB_QUEUE, waitUntil, bucket: env.BACKUP_BUCKET });
      return json(true, { ...st, archive_job_id: created.id, archive_request: created.request_json }, '审计归档任务已创建，后台将继续处理');
    }

    return json(true, st);
  } catch (e: any) {
    return errorResponse(e);
  }
};
