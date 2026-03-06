import { json, requireAuth, errorResponse } from '../../_auth';
import { requireConfirm } from '../../_confirm';
import { logAudit } from '../_audit';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { INSERT_ORDER, DELETE_ORDER, TABLE_COLUMNS, pickRestoreValues, buildInsertSql } from './_backup_schema';
import { finalizeRestore } from './_restore_finalize';

type RestoreBody = {
  mode?: 'merge' | 'merge_upsert' | 'replace';
  confirm?: string;
  backup?: { version?: string; exported_at?: string; tables?: Record<string, any[]> };
};

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request, waitUntil }) => {
  try {
    const actor = await requireAuth(env, request, 'admin');
    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);

    const body = (await request.json().catch(() => ({}))) as RestoreBody;
    const mode = (body.mode || 'merge') as 'merge' | 'merge_upsert' | 'replace';
    const confirmText = mode === 'replace' ? '清空并恢复' : (mode === 'merge_upsert' ? '覆盖导入' : '恢复');
    requireConfirm(body, confirmText, '二次确认不通过');

    const tables = body.backup?.tables || {};
    if (!tables || typeof tables !== 'object') return Response.json({ ok: false, message: '缺少备份数据 tables' }, { status: 400 });

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

    waitUntil(logAudit(env.DB, request, actor, 'ADMIN_RESTORE', 'backup', null, {
      mode,
      backup_version: body.backup?.version || null,
      exported_at: body.backup?.exported_at || null,
      inserted_total: insertedTotal,
      inserted_by_table: insertedByTable,
    }).catch(() => {}));

    return json(true, { mode, inserted_total: insertedTotal, inserted_by_table: insertedByTable });
  } catch (e: any) {
    return errorResponse(e);
  }
};
