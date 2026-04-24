import { requireAuth, errorResponse, json } from '../../../_auth';
import { apiFail } from '../../_response';
import { logAudit } from '../../_audit';
import { ensureCoreSchema } from '../../_schema';
import { nowIso } from './_util';
import { sqlNowStored } from '../../_time';

type RestoreMode = 'merge' | 'merge_upsert' | 'replace';

function expectedConfirmText(mode: RestoreMode) {
  if (mode === 'replace') return '清空并恢复';
  if (mode === 'merge_upsert') return '覆盖导入';
  return '恢复';
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET: any }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, 'admin');
    await ensureCoreSchema(env.DB);

    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) {
      return apiFail('请使用 multipart/form-data 上传备份文件', { status: 400, errorCode: 'RESTORE_MULTIPART_REQUIRED' });
    }

    const form = await request.formData();
    const modeRaw = String(form.get('mode') || 'merge').trim();
    const mode: RestoreMode = (modeRaw === 'merge' || modeRaw === 'replace' || modeRaw === 'merge_upsert') ? modeRaw as RestoreMode : 'merge';
    const confirm = String(form.get('confirm') || '').trim();
    const expected = expectedConfirmText(mode);
    if (confirm !== expected) {
      return apiFail('二次确认不通过', { status: 400, errorCode: 'RESTORE_CONFIRM_INVALID', meta: { expected } });
    }

    const file = form.get('file');
    if (!(file instanceof File)) return apiFail('缺少 file', { status: 400, errorCode: 'RESTORE_FILE_MISSING' });
    if (!env.BACKUP_BUCKET) return apiFail('未绑定 R2：BACKUP_BUCKET。请先在 Cloudflare 里绑定 R2 Bucket。', { status: 500, errorCode: 'BACKUP_BUCKET_NOT_BOUND' });

    const jobId = crypto.randomUUID();
    const key = `restore/${jobId}/${file.name || 'backup.json'}`;

    await env.BACKUP_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: { uploaded_at: nowIso(), uploaded_by: actor.username },
    });

    await env.DB.prepare(
      `INSERT INTO restore_job
       (id, status, stage, mode, file_key, filename, created_by, cursor_json, per_table_json, replaced_done, total_rows, processed_rows, snapshot_status, restore_points_json, created_at, updated_at)
       VALUES (?, 'QUEUED', 'SNAPSHOT', ?, ?, ?, ?, '{}', '{}', 0, 0, 0, 'PENDING', '[]', ${sqlNowStored()}, ${sqlNowStored()})`
    ).bind(jobId, mode, key, file.name || null, actor.username).run();

    waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_JOB_CREATE', 'restore_job', jobId, {
      mode,
      filename: file.name || null,
      file_key: key,
      size: file.size,
      snapshot_status: 'PENDING',
    }).catch(() => {}));

    return json(true, { id: jobId, status: 'QUEUED', stage: 'SNAPSHOT', snapshot_status: 'PENDING' });
  } catch (e: any) {
    return errorResponse(e);
  }
};
