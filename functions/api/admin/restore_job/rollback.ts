import { requireAuth, errorResponse, json } from '../../../_auth';
import { ensureCoreSchema } from '../../_schema';
import { logAudit } from '../../_audit';
import { sqlNowStored } from '../../_time';

type Env = { DB: D1Database; JWT_SECRET: string; BACKUP_BUCKET: any };

export const onRequestPost: PagesFunction<Env> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, 'admin');
    await ensureCoreSchema(env.DB);
    const body = await request.json<any>().catch(() => ({}));
    const id = String(body?.id || '').trim();
    if (!id) return Response.json({ ok: false, message: '缺少 id' }, { status: 400 });
    if (!env.BACKUP_BUCKET) return Response.json({ ok: false, message: '未绑定 R2：BACKUP_BUCKET。' }, { status: 500 });

    const job = await env.DB.prepare(`SELECT id, snapshot_key, snapshot_filename FROM restore_job WHERE id=?`).bind(id).first<any>();
    if (!job?.snapshot_key) return Response.json({ ok: false, message: '该任务没有可用恢复点' }, { status: 400 });
    const obj = await env.BACKUP_BUCKET.get(job.snapshot_key);
    if (!obj?.body) return Response.json({ ok: false, message: '恢复点文件不存在' }, { status: 404 });

    const rollbackId = crypto.randomUUID();
    const key = `restore/${rollbackId}/${job.snapshot_filename || 'rollback.json'}`;
    await env.BACKUP_BUCKET.put(key, obj.body, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { source_job_id: id, created_by: actor.username, type: 'rollback' },
    });

    await env.DB.prepare(
      `INSERT INTO restore_job (id, status, stage, mode, file_key, filename, created_by, cursor_json, per_table_json, replaced_done, total_rows, processed_rows, snapshot_status, restore_points_json, created_at, updated_at)
       VALUES (?, 'QUEUED', 'SCAN', 'replace', ?, ?, ?, '{}', '{}', 0, 0, 0, 'REUSED', '[]', ${sqlNowStored()}, ${sqlNowStored()})`
    ).bind(rollbackId, key, `rollback_of_${id}.json`, actor.username).run();

    waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_JOB_ROLLBACK_CREATE', 'restore_job', rollbackId, { source_job_id: id, snapshot_key: job.snapshot_key }).catch(() => {}));
    return json(true, { id: rollbackId, status: 'QUEUED', stage: 'SCAN' });
  } catch (e: any) {
    return errorResponse(e);
  }
};
