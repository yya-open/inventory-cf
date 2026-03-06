import { errorResponse, json, requireAuth } from '../../_auth';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { getTableColumnsMap, sortTablesForBackup } from './_backup_schema';

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
    if (typeof (globalThis as any).DecompressionStream === 'undefined') {
      throw new Error('当前环境不支持 gzip 解压，请上传 .json 备份');
    }
    const ds = file.stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(ds).text();
  }
  return await file.text();
}

function sampleRowColumns(rows: any[] | undefined): string[] {
  if (!Array.isArray(rows) || !rows.length) return [];
  const set = new Set<string>();
  for (let i = 0; i < rows.length && i < 20; i++) {
    const r = rows[i];
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      for (const k of Object.keys(r)) set.add(k);
    }
  }
  return [...set];
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
    if (!(file instanceof File)) {
      return Response.json({ ok: false, message: '缺少 file' }, { status: 400 });
    }

    const text = await readBackupText(file);
    const backup = JSON.parse(text || '{}');
    const tables = backup?.tables || {};
    if (!tables || typeof tables !== 'object') {
      return Response.json({ ok: false, message: '备份数据为空或格式不正确' }, { status: 400 });
    }

    const issues: Issue[] = [];
    const backupTableNames = sortTablesForBackup(Object.keys(tables));
    const actualColumnsMap = await getTableColumnsMap(env.DB);
    const allTables = sortTablesForBackup(Array.from(new Set([
      ...Object.keys(actualColumnsMap),
      ...backupTableNames,
    ])));

    for (const t of Object.keys(tables)) {
      if (!allTables.includes(t)) {
        issues.push({ severity: 'warn', type: 'unsupported_backup_table', table: t, message: `备份中包含未识别表：${t}（将被忽略）` });
      }
    }

    for (const t of allTables) {
      const rows = (tables as any)[t] as any[] | undefined;
      const backupHasTable = Object.prototype.hasOwnProperty.call(tables, t);
      const actualCols = actualColumnsMap[t] || [];

      if (!backupHasTable) {
        issues.push({ severity: 'info', type: 'backup_table_missing', table: t, message: `备份中未包含表：${t}` });
      }

      if (!actualCols.length) {
        issues.push({ severity: 'error', type: 'db_table_missing', table: t, message: `当前数据库缺少表：${t}` });
        continue;
      }

      if (!backupHasTable) continue;

      const actualSet = new Set(actualCols);
      const backupCols = sampleRowColumns(rows);
      const backupSet = new Set(backupCols);

      for (const c of backupCols) {
        if (!actualSet.has(c)) {
          issues.push({ severity: 'warn', type: 'db_missing_backup_column', table: t, column: c, message: `备份表 ${t} 的字段 ${c} 在当前数据库中不存在（该字段数据将无法恢复）` });
        }
      }

      for (const c of actualCols) {
        if (!backupSet.has(c)) {
          issues.push({ severity: 'info', type: 'backup_column_missing', table: t, column: c, message: `备份表 ${t} 未提供字段：${c}（恢复时将使用当前库默认值或 NULL）` });
        }
      }
    }

    issues.push({
      severity: 'info',
      type: 'restore_scope_tip',
      message: '当前全量备份/恢复已覆盖所有业务表；系统任务表 restore_job 会自动跳过，避免影响正在执行的恢复任务。',
    });

    const counts = { error: 0, warn: 0, info: 0 };
    for (const i of issues) (counts as any)[i.severity]++;

    const backupRowsByTable: Record<string, number> = {};
    const includedInBackup: Record<string, boolean> = {};
    for (const t of allTables) {
      const rows = (tables as any)[t];
      const has = Object.prototype.hasOwnProperty.call(tables, t);
      includedInBackup[t] = has;
      backupRowsByTable[t] = has && Array.isArray(rows) ? rows.length : 0;
    }

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
