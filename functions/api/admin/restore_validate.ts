import { json, requireAuth } from '../../_auth';
import { withErrorHandling } from '../_error';
import { ensureCoreSchema } from '../_schema';
import { ensurePcSchema } from '../_pc';
import { ensureMonitorSchema } from '../_monitor';
import { ALL_TABLE_NAMES, BACKUP_VERSION, RESTORABLE_TABLE_NAMES, TABLE_BY_NAME, TABLE_COLUMNS } from './_backup_schema';
import { validateBackupEnvelope } from './_backup_integrity';
import { readBackupEnvelopeMetadataFromStream } from './restore_job/_util';

type Severity = 'error' | 'warn' | 'info';
type Issue = { severity: Severity; type: string; table?: string; column?: string; message: string };

const INLINE_RESTORE_VALIDATE_MAX_BYTES = 20 * 1024 * 1024;

function sampleRowColumns(rows: any[]) {
  const s = new Set<string>();
  for (const row of rows.slice(0, 20)) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      for (const k of Object.keys(row)) s.add(k);
    }
  }
  return [...s];
}

function countIssues(issues: Issue[]) {
  return {
    error: issues.filter((x) => x.severity === 'error').length,
    warn: issues.filter((x) => x.severity === 'warn').length,
    info: issues.filter((x) => x.severity === 'info').length,
  };
}

function buildPreviewTables(manifest: any) {
  const tableOrder = Array.isArray(manifest?.table_order)
    ? manifest.table_order.filter((t: any): t is string => typeof t === 'string')
    : [];
  const includedInBackup: Record<string, boolean> = {};
  const rowsByTable: Record<string, number> = {};
  for (const t of ALL_TABLE_NAMES) {
    includedInBackup[t] = tableOrder.includes(t);
    rowsByTable[t] = includedInBackup[t] ? Number(manifest?.tables?.[t]?.rows || 0) : 0;
  }
  return { tableOrder, includedInBackup, rowsByTable };
}

async function readBackup(request: Request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('缺少 file');
    if (Number(file.size || 0) > INLINE_RESTORE_VALIDATE_MAX_BYTES) {
      throw new Error(`Backup validation upload is limited to ${INLINE_RESTORE_VALIDATE_MAX_BYTES} bytes; use the staged restore job for large backups.`);
    }
    const lower = (file.name || '').toLowerCase();
    const gzip = lower.endsWith('.gz') || lower.endsWith('.gzip');
    if (gzip && typeof (globalThis as any).DecompressionStream === 'undefined') {
      throw new Error('当前环境不支持 gzip 解压，请上传 .json 备份');
    }
    const preview = await readBackupEnvelopeMetadataFromStream(file.stream(), gzip);
    return {
      ...preview,
      __file_name: file.name || null,
      __file_size: Number(file.size || 0),
    };
  }
  const body: any = await request.json();
  return body?.backup || body || {};
}

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  await requireAuth(env, request, 'admin');
  await ensureCoreSchema(env.DB);
  await ensurePcSchema(env.DB);
  await ensureMonitorSchema(env.DB);

  const backup = await readBackup(request);
  const issues: Issue[] = [];
  const isPreview = Boolean(backup?.__file_name);
  const version = String(backup?.version || backup?.meta?.backup_version || '').trim() || null;
  const manifest = backup?.manifest && typeof backup.manifest === 'object' ? backup.manifest : null;
  const tables = backup?.tables && typeof backup.tables === 'object' ? backup.tables : {};

  if (!version) {
    issues.push({ severity: 'error', type: 'backup_version_missing', message: '备份文件缺少 version 字段' });
  } else if (version !== BACKUP_VERSION && !isPreview) {
    issues.push({ severity: 'error', type: 'backup_version_unsupported', message: `当前系统不支持备份版本：${version}` });
  } else if (isPreview && version !== BACKUP_VERSION && version && version !== BACKUP_VERSION) {
    issues.push({ severity: 'error', type: 'backup_version_unsupported', message: `当前系统不支持备份版本：${version}` });
  }

  if (isPreview) {
    if (!manifest) {
      if (version === BACKUP_VERSION) {
        issues.push({ severity: 'error', type: 'backup_manifest_missing', message: 'v3 备份缺少 manifest' });
      } else {
        issues.push({ severity: 'info', type: 'legacy_manifest_missing', message: '旧版备份未包含 manifest，将按兼容模式校验' });
      }
    } else {
      const { tableOrder, includedInBackup, rowsByTable } = buildPreviewTables(manifest);
      if (!Array.isArray(manifest.table_order) || manifest.table_order.length === 0) {
        issues.push({ severity: 'error', type: 'manifest_table_order_invalid', message: 'manifest.table_order 无效' });
      }
      const manifestTotalRows = tableOrder.reduce((sum: number, t: string) => sum + Number(manifest.tables?.[t]?.rows || 0), 0);
      if (Number(manifest.total_rows || 0) !== manifestTotalRows) {
        issues.push({
          severity: 'warn',
          type: 'manifest_total_rows_mismatch',
          message: `manifest.total_rows=${Number(manifest.total_rows || 0)}，与表行数汇总 ${manifestTotalRows} 不一致`,
        });
      }
      if (Number(manifest.table_count || 0) !== tableOrder.length) {
        issues.push({
          severity: 'warn',
          type: 'manifest_table_count_mismatch',
          message: `manifest.table_count=${Number(manifest.table_count || 0)}，与 table_order 数量 ${tableOrder.length} 不一致`,
        });
      }
      for (const t of tableOrder) {
        if (!ALL_TABLE_NAMES.includes(t)) {
          issues.push({ severity: 'warn', type: 'unsupported_backup_table', table: t, message: `备份包含未识别表：${t}（恢复时将忽略）` });
          continue;
        }
        if (!RESTORABLE_TABLE_NAMES.includes(t)) {
          issues.push({ severity: 'info', type: 'skip_restore_table', table: t, message: `表 ${t} 不参与恢复（系统保护表）` });
        }
      }
      const counts = countIssues(issues);
      return json(true, {
        valid: counts.error === 0,
        counts,
        issues,
        summary: {
          ok: counts.error === 0,
          errors: counts.error,
          warnings: counts.warn,
          infos: counts.info,
        },
        backup_summary: {
          version: backup?.version || null,
          exported_at: backup?.exported_at || null,
          meta: backup?.meta || null,
          manifest,
          integrity: backup?.integrity || null,
          integrity_verified: null,
          current_supported_version: BACKUP_VERSION,
          included_tables: tableOrder,
          included_in_backup: includedInBackup,
          rows_by_table: rowsByTable,
        },
      });
    }
  } else {
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

    const manifestOrder = Array.isArray(manifest?.table_order)
      ? manifest.table_order.filter((t: any): t is string => typeof t === 'string')
      : backupTableNames;
    const includedInBackup: Record<string, boolean> = {};
    const rowsByTable: Record<string, number> = {};
    for (const t of ALL_TABLE_NAMES) {
      const has = Object.prototype.hasOwnProperty.call(tables, t);
      includedInBackup[t] = has;
      rowsByTable[t] = has && Array.isArray(tables[t]) ? tables[t].length : 0;
    }

    const counts = countIssues(issues);
    const valid = counts.error === 0;
    return json(true, {
      valid,
      counts,
      issues,
      summary: {
        ok: valid,
        errors: counts.error,
        warnings: counts.warn,
        infos: counts.info,
      },
      backup_summary: {
        version: backup?.version || null,
        exported_at: backup?.exported_at || null,
        meta: backup?.meta || null,
        manifest,
        integrity: backup?.integrity || null,
        integrity_verified: validation.recomputedIntegrity ? validation.ok : null,
        current_supported_version: BACKUP_VERSION,
        included_tables: manifestOrder,
        included_in_backup: includedInBackup,
        rows_by_table: rowsByTable,
      },
    });
  }

  const counts = countIssues(issues);
  return json(true, {
    valid: counts.error === 0,
    counts,
    issues,
    summary: {
      ok: counts.error === 0,
      errors: counts.error,
      warnings: counts.warn,
      infos: counts.info,
    },
    backup_summary: {
      version: backup?.version || null,
      exported_at: backup?.exported_at || null,
      meta: backup?.meta || null,
      manifest,
      integrity: backup?.integrity || null,
      integrity_verified: null,
      current_supported_version: BACKUP_VERSION,
      included_tables: [],
      included_in_backup: {},
      rows_by_table: {},
    },
  });
});
