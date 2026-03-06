import { json, requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";
import { ensureCoreSchema } from "../_schema";
import { ensurePcSchema } from "../_pc";
import { ensureMonitorSchema } from "../_monitor";
import { buildRestoreInsertSql, getAllTableSchemas, INTERNAL_SKIP_TABLES, pick, sampleRowColumns, sortTablesForDelete, sortTablesForInsert } from "./_backup_schema";

type RestoreMode = "merge" | "merge_upsert" | "replace";

function isGzipMagicBytes(bytes?: Uint8Array | null) {
  return !!bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}
async function sniffGzipFromFile(file: File) {
  try {
    const ab = await file.slice(0, 2).arrayBuffer();
    return isGzipMagicBytes(new Uint8Array(ab));
  } catch {
    const n = String((file as any)?.name || "").toLowerCase();
    return n.endsWith('.gz') || n.endsWith('.gzip');
  }
}
async function readBackupText(file: File) {
  const isGz = await sniffGzipFromFile(file);
  if (isGz) {
    if (typeof (globalThis as any).DecompressionStream === 'undefined') throw new Error('当前环境不支持 gzip 解压，请上传 .json 备份');
    const ds = file.stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(ds).text();
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
    const mode = (String(form.get('mode') || 'merge') as RestoreMode) || 'merge';
    const confirm = String(form.get('confirm') || '');
    requireConfirm({ mode, confirm } as any, mode === 'replace' ? '清空并恢复' : (mode === 'merge_upsert' ? '覆盖导入' : '恢复'), '二次确认不通过');

    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ ok: false, message: '缺少 file' }, { status: 400 });

    const text = await readBackupText(file);
    const backup = JSON.parse(text || '{}');
    const tables = backup?.tables || {};
    if (!tables || typeof tables !== 'object') return Response.json({ ok: false, message: '备份数据为空' }, { status: 400 });

    const dbSchema = await getAllTableSchemas();
    const tableNames = sortTablesForInsert([...new Set(Object.keys(tables).filter((t) => !INTERNAL_SKIP_TABLES.has(t)))])
      .filter((t) => !!dbSchema[t]);

    let insertedTotal = 0;
    const insertedByTable: Record<string, number> = {};

    if (mode === 'replace') {
      const del = sortTablesForDelete(tableNames).map((t) => env.DB.prepare(`DELETE FROM "${t.replace(/"/g, '""')}"`));
      if (del.length) await env.DB.batch(del);
    }

    for (const t of tableNames) {
      const rows = (tables as any)[t] as any[] | undefined;
      if (!rows?.length) continue;
      const dbCols = dbSchema[t].columns.map((c) => c.name);
      const backupCols = Array.isArray((backup?.schema as any)?.[t]?.columns)
        ? ((backup.schema as any)[t].columns || []).map((x: any) => String(x?.name || '').trim()).filter(Boolean)
        : sampleRowColumns(rows);
      const cols = dbCols.filter((c) => backupCols.includes(c));
      if (!cols.length) continue;
      const sql = buildRestoreInsertSql(t, cols, mode, dbSchema[t].unique_keys);

      let i = 0;
      let inserted = 0;
      while (i < rows.length) {
        const chunk = rows.slice(i, i + 50);
        const batch = chunk.map((r) => env.DB.prepare(sql).bind(...pick(r, cols)));
        const res = await env.DB.batch(batch);
        for (const rr of res) inserted += Number((rr as any)?.meta?.changes ?? 0);
        i += 50;
      }
      insertedByTable[t] = inserted;
      insertedTotal += inserted;
    }

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
