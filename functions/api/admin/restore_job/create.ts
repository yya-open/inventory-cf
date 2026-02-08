import { requireAuth, errorResponse, json } from "../../../_auth";
import { logAudit } from "../../_audit";
import { nowIso } from "./_util";

type RestoreMode = "merge" | "merge_upsert" | "replace";

function expectedConfirmText(mode: RestoreMode) {
  if (mode === "replace") return "清空并恢复";
  if (mode === "merge_upsert") return "覆盖导入";
  return "恢复";
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET: any }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, "admin");

    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return Response.json({ ok: false, message: "请使用 multipart/form-data 上传备份文件" }, { status: 400 });
    }

    const form = await request.formData();
    const modeRaw = String(form.get("mode") || "merge").trim();
    const mode: RestoreMode = (modeRaw === "merge" || modeRaw === "replace" || modeRaw === "merge_upsert") ? (modeRaw as RestoreMode) : "merge";
    const confirm = String(form.get("confirm") || "").trim();

    // Server-side confirmation (multipart cannot use JSON-based confirm helper).
    const expected = expectedConfirmText(mode);
    if (confirm !== expected) {
      return Response.json({ ok: false, message: "二次确认不通过", expected }, { status: 400 });
    }

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

    waitUntil(logAudit(env.DB, request, actor, "ADMIN_RESTORE_JOB_CREATE", "restore_job", jobId, {
      mode,
      filename: file.name || null,
      file_key: key,
      size: file.size,
    }).catch(() => {}));
    return json(true, { id: jobId, status: "QUEUED", stage: "SCAN" });
  } catch (e: any) {
    return errorResponse(e);
  }
};
