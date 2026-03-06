import { json, requireAuth, errorResponse } from '../../_auth';
import { requireConfirm } from '../../_confirm';
import { logAudit } from '../_audit';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { DELETE_ORDER, RESTORABLE_TABLE_NAMES, TABLE_COLUMNS } from './_backup_schema';
import { finalizeRestoreState } from './_restore_finalize';

type RestoreMode = 'merge' | 'replace' | 'merge_upsert';

async function readBackupText(file: File) {
  const name = String((file as any).name || '').toLowerCase();
  if (name.endsWith('.gz') || name.endsWith('.gzip')) {
    if (typeof (globalThis as any).DecompressionStream === 'undefined') throw new Error('当前环境不支持 gzip 解压，请上传 .json 备份');
    return await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  return await file.text();
}

function pick(obj: any, cols: string[]) {
  return cols.map((c) => (obj?.[c] === undefined ? null : obj[c]));
}

function buildInsertSql(mode: any, table: string, cols: string[]) {
  const placeholders = cols.map(() => '?').join(',');
  if (mode === 'merge') return `INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
  return `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
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
    const mode = (String(form.get('mode') || 'merge') as RestoreMode) || 'merge';
    const confirm = String(form.get('confirm') || '');
    requireConfirm({ mode, confirm } as any, mode === 'replace' ? '清空并恢复' : mode === 'merge_upsert' ? '覆盖导入' : '恢复', '二次确认不通过');
    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ ok: false, message: '缺少 file' }, { status: 400 });

    const backup = JSON.parse((await readBackupText(file)) || '{}');
    const tables = backup?.tables || {};
    if (!tables || typeof tables !== 'object') return Response.json({ ok: false, message: '备份数据为空' }, { status: 400 });

    if (mode === 'replace') await env.DB.batch(DELETE_ORDER.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));

    let insertedTotal = 0;
    const insertedByTable: Record<string, number> = {};
    for (const t of RESTORABLE_TABLE_NAMES) {
      const rows = (tables as any)[t] as any[] | undefined;
      if (!rows?.length) continue;
      const cols = TABLE_COLUMNS[t];
      const sql = buildInsertSql(mode, t, cols);
      let i = 0;
      let inserted = 0;
      while (i < rows.length) {
        const chunk = rows.slice(i, i + 50);
        const res = await env.DB.batch(chunk.map((r) => env.DB.prepare(sql).bind(...pick(r, cols))));
        for (const rr of res) inserted += Number((rr as any)?.meta?.changes ?? 0);
        i += 50;
      }
      insertedByTable[t] = inserted;
      insertedTotal += inserted;
    }
    await finalizeRestoreState(env.DB);
    waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE_UPLOAD', 'backup', null, { mode, filename: (file as any).name || null, size: (file as any).size || null, backup_version: backup?.version || null, exported_at: backup?.exported_at || null, inserted_total: insertedTotal, inserted_by_table: insertedByTable }).catch(() => {}));
    return json(true, { mode, inserted_total: insertedTotal, inserted_by_table: insertedByTable });
  } catch (e: any) {
    return errorResponse(e);
  }
};
