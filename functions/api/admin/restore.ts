import { json, requireAuth, errorResponse } from '../../_auth';
import { requireConfirm } from '../../_confirm';
import { logAudit } from '../_audit';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { DELETE_ORDER, RESTORABLE_TABLE_NAMES, TABLE_COLUMNS } from './_backup_schema';
import { finalizeRestoreState } from './_restore_finalize';

type RestoreBody = { mode?: 'merge' | 'replace' | 'merge_upsert'; confirm?: string; backup?: { version?: string; exported_at?: string; tables?: Record<string, any[]> } };

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
    const body = (await request.json().catch(() => ({}))) as RestoreBody;
    const mode = (body.mode || 'merge') as 'merge' | 'replace' | 'merge_upsert';
    requireConfirm(body, mode === 'replace' ? '清空并恢复' : mode === 'merge_upsert' ? '覆盖导入' : '恢复', '二次确认不通过');

    const backup = body.backup;
    const tables = backup?.tables || {};
    if (!tables || typeof tables !== 'object') return Response.json({ ok: false, message: '缺少备份数据 tables' }, { status: 400 });

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
    waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE', 'backup', null, { mode, backup_version: backup?.version || null, exported_at: backup?.exported_at || null, inserted_total: insertedTotal, inserted_by_table: insertedByTable }).catch(() => {}));
    return json(true, { mode, inserted_total: insertedTotal, inserted_by_table: insertedByTable });
  } catch (e: any) {
    return errorResponse(e);
  }
};
