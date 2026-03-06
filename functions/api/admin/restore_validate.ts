import { errorResponse, json, requireAuth } from '../../_auth';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { BACKUP_TABLE_MAP, BACKUP_TABLES, RESTORABLE_TABLES, sampleRowColumns } from './_backup_schema';

type Severity = 'error' | 'warn' | 'info';
type Issue = { severity: Severity; type: string; table?: string; column?: string; message: string };

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

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'admin');
    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);

    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) return Response.json({ ok: false, message: '请使用 multipart/form-data 上传备份文件' }, { status: 400 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ ok: false, message: '缺少 file' }, { status: 400 });

    const backup = JSON.parse(await readBackupText(file) || '{}');
    const tables = backup?.tables || {};
    if (!tables || typeof tables !== 'object') return Response.json({ ok: false, message: '备份数据为空或格式不正确' }, { status: 400 });

    const issues: Issue[] = [];
    const allKnown = new Set(BACKUP_TABLES.map((x) => x.key));
    const backupTableNames = Object.keys(tables);

    for (const table of backupTableNames) {
      if (!allKnown.has(table)) {
        issues.push({ severity: 'warn', type: 'unsupported_backup_table', table, message: `备份中包含未识别表：${table}（恢复时将忽略）` });
      }
    }

    for (const meta of BACKUP_TABLES) {
      const table = meta.key;
      const hasTable = Object.prototype.hasOwnProperty.call(tables, table);
      const rows = (tables as any)[table] as any[] | undefined;

      if (table === 'restore_job') {
        issues.push({ severity: 'info', type: 'restore_job_skipped', table, message: '恢复任务表 restore_job 不参与备份恢复，避免恢复任务在执行中被自身覆盖。' });
        continue;
      }

      if (!hasTable) {
        issues.push({
          severity: 'info',
          type: 'backup_table_missing',
          table,
          message: `备份中未包含表：${table}${meta.system ? '（系统表缺失通常不影响业务恢复）' : ''}`,
        });
        continue;
      }

      const backupCols = sampleRowColumns(rows);
      const expectedSet = new Set(meta.columns);
      for (const col of backupCols) {
        if (!expectedSet.has(col)) {
          issues.push({ severity: 'warn', type: 'backup_extra_column', table, column: col, message: `备份表 ${table} 含额外字段：${col}（恢复时将忽略）` });
        }
      }
      for (const col of meta.columns) {
        if (!backupCols.includes(col) && Array.isArray(rows) && rows.length > 0) {
          issues.push({ severity: 'info', type: 'backup_missing_column', table, column: col, message: `备份表 ${table} 未提供字段：${col}（恢复时将使用当前库默认值或 NULL）` });
        }
      }

      if (!RESTORABLE_TABLES.includes(table)) {
        issues.push({ severity: 'info', type: 'table_not_restorable', table, message: `表 ${table} 不参与恢复。` });
      }
    }

    const counts = { error: 0, warn: 0, info: 0 };
    for (const issue of issues) (counts as any)[issue.severity]++;

    const rowsByTable: Record<string, number> = {};
    const includedInBackup: Record<string, boolean> = {};
    for (const meta of BACKUP_TABLES) {
      const table = meta.key;
      const has = Object.prototype.hasOwnProperty.call(tables, table);
      includedInBackup[table] = has;
      rowsByTable[table] = has && Array.isArray((tables as any)[table]) ? (tables as any)[table].length : 0;
    }

    return json(true, {
      valid: counts.error === 0,
      counts,
      issues,
      backup_summary: {
        version: backup?.version || null,
        exported_at: backup?.exported_at || null,
        tables: BACKUP_TABLES.map((x) => x.key),
        included_tables: backupTableNames,
        included_in_backup: includedInBackup,
        rows_by_table: rowsByTable,
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
