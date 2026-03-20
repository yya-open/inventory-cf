import { sqlNowStored } from '../_time';
import { countAuditRows, listAuditRows, parseAuditListFilters } from './audit-log';
import { buildPcAssetQuery, countByWhere, listPcAssets, type QueryParts } from './asset-ledger';

export type AsyncJobType = 'AUDIT_EXPORT' | 'PC_AGE_WARNING_EXPORT';
export type AsyncJobStatus = 'queued' | 'running' | 'success' | 'failed';

export async function ensureAsyncJobsTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS async_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      created_by INTEGER,
      created_by_name TEXT,
      permission_scope TEXT,
      request_json TEXT,
      result_text TEXT,
      result_content_type TEXT,
      result_filename TEXT,
      message TEXT,
      error_text TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_async_jobs_status_created_at ON async_jobs(status, created_at DESC, id DESC)`).run();
}

function csvEscape(v: any) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function listPcAssetsForExport(db: D1Database, baseQuery: QueryParts, limit: number, offset = 0) {
  const rows: any[] = [];
  let remaining = Math.max(0, limit);
  let currentOffset = Math.max(0, offset);
  while (remaining > 0) {
    const chunkSize = Math.min(200, remaining);
    const chunk = await listPcAssets(db, { ...baseQuery, page: 1, pageSize: chunkSize, offset: currentOffset, fast: false });
    if (!chunk.length) break;
    rows.push(...chunk);
    currentOffset += chunk.length;
    remaining -= chunk.length;
    if (chunk.length < chunkSize) break;
  }
  return rows;
}

async function buildJobResult(db: D1Database, type: AsyncJobType, requestJson: any) {
  if (type === 'AUDIT_EXPORT') {
    const url = new URL('https://local/export');
    for (const [k, v] of Object.entries(requestJson || {})) if (v != null) url.searchParams.set(k, String(v));
    const filters = parseAuditListFilters(url);
    const scope = String(requestJson?.scope || 'all');
    const total = await countAuditRows(db, filters);
    const limit = scope === 'current' ? filters.pageSize : Math.min(total, Number(requestJson?.max_rows || 10000));
    const offset = scope === 'current' ? filters.offset : 0;
    const rows = limit > 0 ? await listAuditRows(db, filters, { limit, offset }) : [];
    const lines = [['时间','用户','模块','动作','实体','实体ID','对象名称','摘要'].join(',')];
    for (const row of rows) {
      lines.push([
        csvEscape((row as any).created_at),
        csvEscape((row as any).username),
        csvEscape((row as any).module_code),
        csvEscape((row as any).action),
        csvEscape((row as any).entity),
        csvEscape((row as any).entity_id),
        csvEscape((row as any).target_name || (row as any).target_code || ''),
        csvEscape((row as any).summary_text || ''),
      ].join(','));
    }
    return {
      text: '\ufeff' + lines.join('\n'),
      filename: `audit_export_${Date.now()}.csv`,
      contentType: 'text/csv; charset=utf-8',
      message: `已生成 ${rows.length} 条审计导出`,
    };
  }

  const url = new URL('https://local/export');
  for (const [k, v] of Object.entries(requestJson || {})) if (v != null) url.searchParams.set(k, String(v));
  const query = buildPcAssetQuery(url);
  const scope = String(requestJson?.scope || 'all');
  const total = await countByWhere(db, 'pc_assets a', query);
  const limit = scope === 'current' ? query.pageSize : Math.min(total, Number(requestJson?.max_rows || 10000));
  const offset = scope === 'current' ? query.offset : 0;
  const rows = limit > 0 ? await listPcAssetsForExport(db, query, limit, offset) : [];
  const lines = [['品牌','型号','序列号','出厂时间','状态','领用人','工号','部门','备注'].join(',')];
  for (const row of rows) {
    lines.push([
      csvEscape((row as any).brand),
      csvEscape((row as any).model),
      csvEscape((row as any).serial_no),
      csvEscape((row as any).manufacture_date),
      csvEscape((row as any).status),
      csvEscape((row as any).last_employee_name || ''),
      csvEscape((row as any).last_employee_no || ''),
      csvEscape((row as any).last_department || ''),
      csvEscape((row as any).remark || ''),
    ].join(','));
  }
  return {
    text: '\ufeff' + lines.join('\n'),
    filename: `pc_age_warnings_${Date.now()}.csv`,
    contentType: 'text/csv; charset=utf-8',
    message: `已生成 ${rows.length} 条报废预警导出`,
  };
}

export async function createAsyncJob(db: D1Database, input: { job_type: AsyncJobType; created_by?: number | null; created_by_name?: string | null; permission_scope?: string | null; request_json?: any }) {
  await ensureAsyncJobsTable(db);
  const res = await db.prepare(
    `INSERT INTO async_jobs (job_type, status, created_by, created_by_name, permission_scope, request_json, created_at, updated_at)
     VALUES (?, 'queued', ?, ?, ?, ?, ${sqlNowStored()}, ${sqlNowStored()})`
  ).bind(input.job_type, input.created_by ?? null, input.created_by_name ?? null, input.permission_scope ?? null, JSON.stringify(input.request_json || {})).run();
  return Number((res as any)?.meta?.last_row_id || 0);
}

export async function processAsyncJob(db: D1Database, id: number) {
  await ensureAsyncJobsTable(db);
  const row = await db.prepare(`SELECT * FROM async_jobs WHERE id=?`).bind(id).first<any>();
  if (!row) throw Object.assign(new Error('任务不存在'), { status: 404 });
  const jobType = String(row.job_type || '') as AsyncJobType;
  const req = row.request_json ? JSON.parse(String(row.request_json)) : {};
  await db.prepare(`UPDATE async_jobs SET status='running', started_at=${sqlNowStored()}, updated_at=${sqlNowStored()}, error_text=NULL WHERE id=?`).bind(id).run();
  try {
    const result = await buildJobResult(db, jobType, req);
    await db.prepare(
      `UPDATE async_jobs
       SET status='success', result_text=?, result_content_type=?, result_filename=?, message=?, finished_at=${sqlNowStored()}, updated_at=${sqlNowStored()}
       WHERE id=?`
    ).bind(result.text, result.contentType, result.filename, result.message, id).run();
  } catch (error: any) {
    await db.prepare(
      `UPDATE async_jobs
       SET status='failed', error_text=?, finished_at=${sqlNowStored()}, updated_at=${sqlNowStored()}
       WHERE id=?`
    ).bind(String(error?.message || error || '任务执行失败'), id).run();
  }
}

export async function listAsyncJobs(db: D1Database, limit = 100) {
  await ensureAsyncJobsTable(db);
  const { results } = await db.prepare(
    `SELECT id, job_type, status, created_by, created_by_name, permission_scope, message, error_text, result_filename, started_at, finished_at, created_at, updated_at
     FROM async_jobs
     ORDER BY id DESC
     LIMIT ?`
  ).bind(Math.max(1, Math.min(200, Number(limit || 100)))).all<any>();
  return results || [];
}

export async function getAsyncJob(db: D1Database, id: number) {
  await ensureAsyncJobsTable(db);
  return await db.prepare(`SELECT * FROM async_jobs WHERE id=?`).bind(id).first<any>();
}
