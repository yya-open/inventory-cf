import { sqlNowStored } from '../_time';
import { countAuditRows, listAuditRows, parseAuditListFilters } from './audit-log';
import { buildPcAssetQuery, countByWhere, listPcAssets, type QueryParts } from './asset-ledger';

export type AsyncJobType = 'AUDIT_EXPORT' | 'PC_AGE_WARNING_EXPORT';
export type AsyncJobStatus = 'queued' | 'running' | 'success' | 'failed' | 'canceled';

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
  const alters = [
    `ALTER TABLE async_jobs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE async_jobs ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE async_jobs ADD COLUMN cancel_requested INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE async_jobs ADD COLUMN canceled_at TEXT`,
    `ALTER TABLE async_jobs ADD COLUMN retain_until TEXT`,
    `ALTER TABLE async_jobs ADD COLUMN result_deleted_at TEXT`,
  ];
  for (const sql of alters) {
    try { await db.prepare(sql).run(); } catch {}
  }
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_async_jobs_status_created_at ON async_jobs(status, created_at DESC, id DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_async_jobs_created_by_status ON async_jobs(created_by, status, id DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_async_jobs_retain_until ON async_jobs(retain_until, id DESC)`).run();
}

function csvEscape(v: any) {
  const s = String(v ?? '');
  if (/[",
]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
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
    return { text: '﻿' + lines.join('
'), filename: `audit_export_${Date.now()}.csv`, contentType: 'text/csv; charset=utf-8', message: `已生成 ${rows.length} 条审计导出` };
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
      csvEscape((row as any).brand), csvEscape((row as any).model), csvEscape((row as any).serial_no), csvEscape((row as any).manufacture_date), csvEscape((row as any).status), csvEscape((row as any).last_employee_name || ''), csvEscape((row as any).last_employee_no || ''), csvEscape((row as any).last_department || ''), csvEscape((row as any).remark || ''),
    ].join(','));
  }
  return { text: '﻿' + lines.join('
'), filename: `pc_age_warnings_${Date.now()}.csv`, contentType: 'text/csv; charset=utf-8', message: `已生成 ${rows.length} 条报废预警导出` };
}

export async function cleanupExpiredAsyncJobResults(db: D1Database) {
  await ensureAsyncJobsTable(db);
  const res = await db.prepare(
    `UPDATE async_jobs
     SET result_text=NULL,
         result_deleted_at=COALESCE(result_deleted_at, ${sqlNowStored()}),
         updated_at=${sqlNowStored()},
         message=CASE WHEN COALESCE(message,'')='' THEN '结果文件已过保留期，已清理' ELSE message || '（结果文件已过期清理）' END
     WHERE status='success'
       AND result_text IS NOT NULL
       AND retain_until IS NOT NULL
       AND retain_until < ${sqlNowStored()}`
  ).run();
  return Number((res as any)?.meta?.changes || 0);
}

export async function cleanupAsyncJobHousekeeping(db: D1Database) {
  await ensureAsyncJobsTable(db);
  const expiredResults = await cleanupExpiredAsyncJobResults(db);
  const purgeFinished = await db.prepare(
    `DELETE FROM async_jobs
     WHERE status IN ('success','failed','canceled')
       AND COALESCE(result_text,'')=''
       AND COALESCE(finished_at, canceled_at, updated_at, created_at) < datetime('now','+8 hours','-30 day')`
  ).run();
  const staleQueued = await db.prepare(
    `UPDATE async_jobs
     SET status='canceled',
         canceled_at=${sqlNowStored()},
         updated_at=${sqlNowStored()},
         message=CASE WHEN COALESCE(message,'')='' THEN '任务排队超时，已自动取消' ELSE message || '（排队超时自动取消）' END
     WHERE status='queued'
       AND created_at < datetime('now','+8 hours','-1 day')`
  ).run();
  return {
    expired_results: expiredResults,
    purged_rows: Number((purgeFinished as any)?.meta?.changes || 0),
    auto_canceled: Number((staleQueued as any)?.meta?.changes || 0),
  };
}

export async function createAsyncJob(db: D1Database, input: { job_type: AsyncJobType; created_by?: number | null; created_by_name?: string | null; permission_scope?: string | null; request_json?: any; retain_days?: number | null; max_retries?: number | null }) {
  await cleanupAsyncJobHousekeeping(db);
  const retainDays = Math.max(1, Math.min(30, Number(input.retain_days || 7)));
  const maxRetries = Math.max(0, Math.min(5, Number(input.max_retries ?? 1)));
  const res = await db.prepare(
    `INSERT INTO async_jobs (job_type, status, created_by, created_by_name, permission_scope, request_json, retain_until, max_retries, created_at, updated_at)
     VALUES (?, 'queued', ?, ?, ?, ?, datetime('now','+8 hours', ?), ?, ${sqlNowStored()}, ${sqlNowStored()})`
  ).bind(input.job_type, input.created_by ?? null, input.created_by_name ?? null, input.permission_scope ?? null, JSON.stringify(input.request_json || {}), `+${retainDays} day`, maxRetries).run();
  return Number((res as any)?.meta?.last_row_id || 0);
}

export async function processAsyncJob(db: D1Database, id: number) {
  await cleanupAsyncJobHousekeeping(db);
  const row = await db.prepare(`SELECT * FROM async_jobs WHERE id=?`).bind(id).first<any>();
  if (!row) throw Object.assign(new Error('任务不存在'), { status: 404 });
  if (Number(row.cancel_requested || 0) === 1 || String(row.status) === 'canceled') {
    await db.prepare(`UPDATE async_jobs SET status='canceled', canceled_at=COALESCE(canceled_at, ${sqlNowStored()}), updated_at=${sqlNowStored()} WHERE id=?`).bind(id).run();
    return;
  }
  const jobType = String(row.job_type || '') as AsyncJobType;
  const req = row.request_json ? JSON.parse(String(row.request_json)) : {};
  await db.prepare(`UPDATE async_jobs SET status='running', started_at=${sqlNowStored()}, updated_at=${sqlNowStored()}, error_text=NULL WHERE id=?`).bind(id).run();
  try {
    const result = await buildJobResult(db, jobType, req);
    const latest = await db.prepare(`SELECT cancel_requested FROM async_jobs WHERE id=?`).bind(id).first<any>();
    if (Number(latest?.cancel_requested || 0) === 1) {
      await db.prepare(`UPDATE async_jobs SET status='canceled', canceled_at=${sqlNowStored()}, updated_at=${sqlNowStored()}, message='任务已取消' WHERE id=?`).bind(id).run();
      return;
    }
    await db.prepare(
      `UPDATE async_jobs SET status='success', result_text=?, result_content_type=?, result_filename=?, message=?, finished_at=${sqlNowStored()}, updated_at=${sqlNowStored()} WHERE id=?`
    ).bind(result.text, result.contentType, result.filename, result.message, id).run();
  } catch (error: any) {
    const latest = await db.prepare(`SELECT cancel_requested FROM async_jobs WHERE id=?`).bind(id).first<any>();
    if (Number(latest?.cancel_requested || 0) === 1) {
      await db.prepare(`UPDATE async_jobs SET status='canceled', canceled_at=${sqlNowStored()}, updated_at=${sqlNowStored()}, message='任务已取消' WHERE id=?`).bind(id).run();
      return;
    }
    await db.prepare(`UPDATE async_jobs SET status='failed', error_text=?, finished_at=${sqlNowStored()}, updated_at=${sqlNowStored()} WHERE id=?`).bind(String(error?.message || error || '任务执行失败'), id).run();
  }
}

export async function listAsyncJobs(db: D1Database, options: { limit?: number; status?: string | null; job_type?: string | null; created_by?: number | null } = {}) {
  await cleanupAsyncJobHousekeeping(db);
  const limit = Math.max(1, Math.min(200, Number(options.limit || 100)));
  const where: string[] = [];
  const binds: any[] = [];
  if (options.status) { where.push(`status=?`); binds.push(String(options.status)); }
  if (options.job_type) { where.push(`job_type=?`); binds.push(String(options.job_type)); }
  if (options.created_by) { where.push(`created_by=?`); binds.push(Number(options.created_by)); }
  const sql = `SELECT id, job_type, status, created_by, created_by_name, permission_scope, message, error_text, result_filename, started_at, finished_at, created_at, updated_at, retry_count, max_retries, cancel_requested, retain_until, result_deleted_at FROM async_jobs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...binds, limit).all<any>();
  return results || [];
}

export async function getAsyncJob(db: D1Database, id: number) {
  await cleanupAsyncJobHousekeeping(db);
  await ensureAsyncJobsTable(db);
  return await db.prepare(`SELECT * FROM async_jobs WHERE id=?`).bind(id).first<any>();
}

export async function cancelAsyncJob(db: D1Database, id: number) {
  await ensureAsyncJobsTable(db);
  const row = await getAsyncJob(db, id);
  if (!row) throw Object.assign(new Error('任务不存在'), { status: 404 });
  if (String(row.status) === 'success') throw Object.assign(new Error('任务已完成，不能取消'), { status: 409 });
  if (String(row.status) === 'failed') throw Object.assign(new Error('任务已失败，请直接重试'), { status: 409 });
  const res = await db.prepare(
    `UPDATE async_jobs SET cancel_requested=1, status=CASE WHEN status='queued' THEN 'canceled' ELSE status END, canceled_at=CASE WHEN status='queued' THEN ${sqlNowStored()} ELSE canceled_at END, updated_at=${sqlNowStored()}, message=CASE WHEN status='queued' THEN '任务已取消' ELSE '任务取消中' END WHERE id=?`
  ).bind(id).run();
  return Number((res as any)?.meta?.changes || 0) > 0;
}

export async function retryAsyncJob(db: D1Database, id: number) {
  await ensureAsyncJobsTable(db);
  const row = await getAsyncJob(db, id);
  if (!row) throw Object.assign(new Error('任务不存在'), { status: 404 });
  if (!['failed', 'canceled'].includes(String(row.status))) throw Object.assign(new Error('仅失败或已取消任务可重试'), { status: 409 });
  const retryCount = Number(row.retry_count || 0);
  const maxRetries = Number(row.max_retries || 1);
  if (retryCount >= maxRetries) throw Object.assign(new Error(`已超过最大重试次数（${maxRetries}）`), { status: 409 });
  await db.prepare(
    `UPDATE async_jobs SET status='queued', cancel_requested=0, canceled_at=NULL, error_text=NULL, message='任务已重新排队', started_at=NULL, finished_at=NULL, result_text=NULL, result_content_type=NULL, result_filename=NULL, result_deleted_at=NULL, retry_count=COALESCE(retry_count,0)+1, updated_at=${sqlNowStored()} WHERE id=?`
  ).bind(id).run();
}
