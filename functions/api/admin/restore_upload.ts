import { json, requireAuth, errorResponse } from '../../_auth';
import { requireConfirm } from '../../_confirm';
import { logAudit } from '../_audit';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { INSERT_ORDER, DELETE_ORDER, TABLE_COLUMNS, pickRestoreValues, buildInsertSql } from './_backup_schema';
import { finalizeRestore } from './_restore_finalize';

type RestoreMode = 'merge' | 'merge_upsert' | 'replace';

function isGzipMagicBytes(bytes?: Uint8Array | null) {
  return !!bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}
async function sniffGzipFromFile(file: File) {
  try {
    const ab = await file.slice(0, 2).arrayBuffer();
    return isGzipMagicBytes(new Uint8Array(ab));
  } catch {
    const n = String((file as any)?.name || '').toLowerCase();
    return n.endsWith('.gz') || n.endsWith('.gzip');
  }
}
async function readBackupText(file: File) {
  const isGz = await sniffGzipFromFile(file);
  if (isGz) {
    if (typeof (globalThis as any).DecompressionStream === 'undefined') throw new Error('当前环境不支持 gzip 解压，请上传 .json 备份');
    return await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  return await file.text();
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, 'admin');
    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);

    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) return Response.json({ ok: false, message: '请使用 multipart/form-data 上传备份文件' }, { status: 400 });

    const form = await request.formData();
    const mode = (String(form.get('mode') || 'merge').trim() as RestoreMode) || 'merge';
    const confirmText = mode === 'replace' ? '清空并恢复' : (mode === 'merge_upsert' ? '覆盖导入' : '恢复');
    requireConfirm({ mode, confirm: String(form.get('confirm') || '') } as any, confirmText, '二次确认不通过');

    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ ok: false, message: '缺少 file' }, { status: 400 });

    const backup = JSON.parse(await readBackupText(file) || '{}');
    const tables = backup?.tables || {};
    if (!tables || typeof tables !== 'object') return Response.json({ ok: false, message: '备份数据为空' }, { status: 400 });

    if (mode === 'replace') {
      await env.DB.batch(DELETE_ORDER.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
    }

    let insertedTotal = 0;
    const insertedByTable: Record<string, number> = {};

    for (const table of INSERT_ORDER) {
      const rows = (tables as any)[table] as any[] | undefined;
      if (!rows?.length) continue;
      const cols = TABLE_COLUMNS[table];
      const sql = buildInsertSql(table, cols, mode);
      let inserted = 0;

      for (let i = 0; i < rows.length; i += 50) {
        const chunk = rows.slice(i, i + 50);
        const batch = chunk.map((r) => env.DB.prepare(sql).bind(...pickRestoreValues(r, cols)));
        const res = await env.DB.batch(batch);
        for (const rr of res) inserted += Number((rr as any)?.meta?.changes ?? 0);
      }

      insertedByTable[table] = inserted;
      insertedTotal += inserted;
    }

    await finalizeRestore(env.DB);

    waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_UPLOAD', 'backup', null, {
      mode,
      filename: (file as any).name || null,
      size: (file as any).size || null,
      backup_version: backup?.version || null,
      exported_at: backup?.exported_at || null,
      inserted_total: insertedTotal,
      inserted_by_table: insertedByTable,
    }).catch(() => {}));

    return json(true, { mode, inserted_total: insertedTotal, inserted_by_table: insertedByTable });
  } catch (e: any) {
    return errorResponse(e);
  }
};
