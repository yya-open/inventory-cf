import { errorResponse, json, requireAuth } from '../../_auth';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { ALL_TABLE_NAMES, BACKUP_VERSION, RESTORABLE_TABLE_NAMES, TABLE_BY_NAME, TABLE_COLUMNS } from './_backup_schema';
import { validateBackupEnvelope } from './_backup_integrity';

type Severity = 'error' | 'warn' | 'info';
type Issue = { severity: Severity; type: string; table?: string; column?: string; message: string };

function sampleRowColumns(rows: any[]) {
  const s = new Set<string>();
  for (const row of rows.slice(0, 20)) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      for (const k of Object.keys(row)) s.add(k);
    }
  }
  return [...s];
}

async function readBackup(request: Request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('缺少 file');
    const lower = (file.name || '').toLowerCase();
    let text = '';
    if (lower.endsWith('.gz') || lower.endsWith('.gzip')) {
      if (typeof (globalThis as any).DecompressionStream === 'undefined') throw new Error('当前环境不支持 gzip 解压，请上传 .json 备份');
      text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } else {
      text = await file.text();
    }
    return JSON.parse(text || '{}');
  }
  const body: any = await request.json();
  return body?.backup || body || {};
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    await requireAuth(env, request, 'admin');
    await ensureCoreSchema(env.DB);
    await ensurePcSchema(env.DB);
    await ensureMonitorSchema(env.DB);

    const backup = await readBackup(request);
    const tables = backup?.tables || {};
    const issues: Issue[] = [];
    const backupTableNames = Object.keys(tables || {});

    const validation = await validateBackupEnvelope(backup);
    for (const item of validation.issues) {
      issues.push({
        severity: item.severity,
        type: item.type,
        table: item.table,
        message: item.message,
      });
    }

    for (const t of backupTableNames) {
      if (!ALL_TABLE_NAMES.includes(t)) {
        issues.push({ severity: 'warn', type: 'unsupported_backup_table', table: t, message: `备份中包含未识别表：${t}（恢复时将忽略）` });
      }
    }

    for (const t of ALL_TABLE_NAMES) {
      const dbCols = TABLE_COLUMNS[t] || [];
      const rows = Array.isArray(tables[t]) ? tables[t] : [];
      const hasTable = Object.prototype.hasOwnProperty.call(tables, t);
      if (!hasTable) {
        const def = TABLE_BY_NAME[t];
        const msg = def?.allowRestore === false
          ? `当前系统会自动跳过表：${t}`
          : `备份中未包含表：${t}`;
        issues.push({ severity: 'info', type: 'backup_table_missing', table: t, message: msg });
        continue;
      }
      if (!RESTORABLE_TABLE_NAMES.includes(t)) {
        issues.push({ severity: 'info', type: 'skip_restore_table', table: t, message: `表 ${t} 不参与恢复（系统保护表）` });
        continue;
      }
      const backupCols = sampleRowColumns(rows);
      for (const c of backupCols) {
        if (!dbCols.includes(c)) {
          issues.push({ severity: 'warn', type: 'backup_extra_column', table: t, column: c, message: `备份表 ${t} 含额外字段：${c}（恢复时将忽略）` });
        }
      }
      for (const c of dbCols) {
        if (!backupCols.includes(c) && rows.length > 0) {
          issues.push({ severity: 'info', type: 'backup_missing_column', table: t, column: c, message: `备份表 ${t} 未提供字段：${c}（恢复时将使用当前库默认值或 NULL）` });
        }
      }
    }

    const rowsByTable: Record<string, number> = {};
    const includedInBackup: Record<string, boolean> = {};
    for (const t of ALL_TABLE_NAMES) {
      const has = Object.prototype.hasOwnProperty.call(tables, t);
      includedInBackup[t] = has;
      rowsByTable[t] = has && Array.isArray(tables[t]) ? tables[t].length : 0;
    }

    return json(true, {
      issues,
      summary: {
        ok: issues.every((x) => x.severity !== 'error'),
        errors: issues.filter((x) => x.severity === 'error').length,
        warnings: issues.filter((x) => x.severity === 'warn').length,
        infos: issues.filter((x) => x.severity === 'info').length,
      },
      backup_summary: {
        version: backup?.version || null,
        exported_at: backup?.exported_at || null,
        meta: backup?.meta || null,
        manifest: backup?.manifest || null,
        integrity: backup?.integrity || null,
        integrity_verified: validation.ok,
        current_supported_version: BACKUP_VERSION,
        included_tables: backupTableNames,
        included_in_backup: includedInBackup,
        rows_by_table: rowsByTable,
      }
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
