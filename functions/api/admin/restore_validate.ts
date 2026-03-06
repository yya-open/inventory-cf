import { errorResponse, json, requireAuth } from '../../_auth';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { canSafelyFillMissing, getAllTableSchemas, INTERNAL_SKIP_TABLES, sampleRowColumns, sortTablesForInsert } from './_backup_schema';

type Severity = 'error' | 'warn' | 'info';

type Issue = {
  severity: Severity;
  type: string;
  table?: string;
  column?: string;
  message: string;
};

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
    const ds = file.stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(ds).text();
  }
  return await file.text();
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'admin');
    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);

    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) {
      return Response.json({ ok: false, message: '请使用 multipart/form-data 上传备份文件' }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ ok: false, message: '缺少 file' }, { status: 400 });

    const text = await readBackupText(file);
    const backup = JSON.parse(text || '{}');
    const tables = backup?.tables || {};
    if (!tables || typeof tables !== 'object') {
      return Response.json({ ok: false, message: '备份数据为空或格式不正确' }, { status: 400 });
    }

    const dbSchema = await getAllTableSchemas();
    const dbTables = Object.keys(dbSchema);
    const backupSchema = (backup?.schema && typeof backup.schema === 'object') ? backup.schema : {};
    const backupTableNames = Object.keys(tables).filter((t) => !INTERNAL_SKIP_TABLES.has(t));
    const allTables = sortTablesForInsert([...new Set([...dbTables, ...backupTableNames])]);

    const issues: Issue[] = [];
    const includedInBackup: Record<string, boolean> = {};
    const backupRowsByTable: Record<string, number> = {};

    for (const t of allTables) {
      const rows = (tables as any)[t] as any[] | undefined;
      const backupHasTable = Object.prototype.hasOwnProperty.call(tables, t);
      includedInBackup[t] = backupHasTable;
      backupRowsByTable[t] = backupHasTable && Array.isArray(rows) ? rows.length : 0;

      if (!backupHasTable) {
        issues.push({ severity: 'info', type: 'backup_table_missing', table: t, message: `备份中未包含表：${t}` });
      }

      const dbTable = dbSchema[t];
      if (!dbTable) {
        issues.push({ severity: 'error', type: 'db_table_missing', table: t, message: `当前数据库缺少表：${t}` });
        continue;
      }

      const dbCols = dbTable.columns;
      const dbColMap = new Map(dbCols.map((c) => [c.name, c] as const));
      const backupCols = Array.isArray((backupSchema as any)?.[t]?.columns)
        ? ((backupSchema as any)[t].columns || []).map((x: any) => String(x?.name || '').trim()).filter(Boolean)
        : sampleRowColumns(rows);
      const backupColSet = new Set(backupCols);

      for (const c of backupCols) {
        if (!dbColMap.has(c)) {
          issues.push({ severity: 'warn', type: 'backup_extra_column', table: t, column: c, message: `备份字段 ${t}.${c} 在当前数据库中不存在，恢复时将忽略该字段` });
        }
      }

      for (const col of dbCols) {
        if (backupColSet.has(col.name)) continue;
        const safe = canSafelyFillMissing(col);
        issues.push({
          severity: safe ? 'info' : 'warn',
          type: safe ? 'backup_missing_column_fill_default' : 'backup_missing_required_column',
          table: t,
          column: col.name,
          message: safe
            ? `备份表 ${t} 未提供字段：${col.name}（恢复时将使用当前库默认值或 NULL，属正常兼容提示）`
            : `备份表 ${t} 缺少必填字段：${col.name}（当前库无默认值，恢复该字段时可能失败）`,
        });
      }
    }

    for (const t of Object.keys(tables)) {
      if (INTERNAL_SKIP_TABLES.has(t)) {
        issues.push({ severity: 'info', type: 'internal_table_skipped', table: t, message: `系统任务表 ${t} 会自动跳过，避免影响正在执行的恢复任务` });
      } else if (!dbSchema[t]) {
        issues.push({ severity: 'warn', type: 'unknown_backup_table', table: t, message: `备份中包含当前库不存在的表：${t}（将跳过）` });
      }
    }

    const counts = { error: 0, warn: 0, info: 0 };
    for (const i of issues) (counts as any)[i.severity]++;

    return json(true, {
      valid: counts.error === 0,
      counts,
      issues,
      backup_summary: {
        version: backup?.version || null,
        exported_at: backup?.exported_at || null,
        tables: allTables,
        included_tables: backupTableNames,
        included_in_backup: includedInBackup,
        rows_by_table: backupRowsByTable,
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
