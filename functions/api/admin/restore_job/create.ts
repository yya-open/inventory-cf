import { requireAuth, errorResponse, json } from "../../../_auth";
import { requireConfirm } from "../../../_confirm";
import { logAudit } from "../../_audit";
import { nowIso } from "./_util";

type RestoreMode = "merge" | "replace";

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET: any }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");

    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return Response.json({ ok: false, message: "请使用 multipart/form-data 上传备份文件" }, { status: 400 });
    }

    const form = await request.formData();
    const mode = (String(form.get("mode") || "merge") as RestoreMode) || "merge";
    const confirm = String(form.get("confirm") || "");
    requireConfirm({ mode, confirm } as any, mode === "replace" ? "清空并恢复" : "恢复", "二次确认不通过");

    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, message: "缺少 file" }, { status: 400 });
    }

    if (!env.BACKUP_BUCKET) {
      return Response.json({ ok: false, message: "未绑定 R2：BACKUP_BUCKET。请先在 Cloudflare 里绑定 R2 Bucket。" }, { status: 500 });
    }

    const jobId = crypto.randomUUID();
    const key = `restore/${jobId}/${file.name || "backup.json"}`;

    // Upload to R2 (streaming)
    await env.BACKUP_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { uploaded_at: nowIso(), uploaded_by: actor.username },
    });

    await env.DB.prepare(
      `INSERT INTO restore_job (id, status, stage, mode, file_key, filename, created_by, cursor_json, per_table_json, replaced_done, total_rows, processed_rows, created_at, updated_at)
       VALUES (?, 'QUEUED', 'SCAN', ?, ?, ?, ?, '{}', '{}', 0, 0, 0, datetime('now'), datetime('now'))`
    )
      .bind(jobId, mode, key, file.name || null, actor.username)
      .run();

    logAudit(env.DB, request, actor, "ADMIN_RESTORE_JOB_CREATE", "restore_job", jobId, {
      mode,
      filename: file.name || null,
      file_key: key,
      size: file.size,
    }).catch(() => {});

    return json(true, { id: jobId, status: "QUEUED", stage: "SCAN" });
  } catch (e: any) {
    return errorResponse(e);
  }
};
