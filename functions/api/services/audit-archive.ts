import { getAuditLifecycle, listAuditArchiveRuns } from '../_audit';
import { createAsyncJob, processAsyncJob } from './async-jobs';

const ARCHIVE_JOB_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function clampInt(value: any, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function boolLike(value: any) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

async function hasPendingArchiveJob(db: D1Database) {
  try {
    const row = await db.prepare(
      `SELECT COUNT(*) AS c
         FROM async_jobs
        WHERE job_type='AUDIT_ARCHIVE_EXPORT'
          AND status IN ('queued','running')`
    ).first<any>();
    return Number(row?.c || 0) > 0;
  } catch {
    return false;
  }
}

export async function createAuditArchiveJob(
  db: D1Database,
  input: {
    created_by?: number | null;
    created_by_name?: string | null;
    archive_after_days?: number | null;
    max_rows?: number | null;
    delete_after_export?: boolean | number | string | null;
    retain_days?: number | null;
    reason?: string | null;
  },
  bucket?: any,
) {
  if (!bucket) throw new Error('未绑定 R2：BACKUP_BUCKET。请先在 Cloudflare 里绑定 R2 Bucket。');
  const lifecycle = await getAuditLifecycle(db, { forceRefreshStats: true });
  const archiveAfterDays = clampInt(input.archive_after_days, lifecycle.archive_after_days, 1, 3650);
  const maxRows = clampInt(input.max_rows, lifecycle.max_archive_rows, 100, 50000);
  const deleteAfterExport = boolLike(input.delete_after_export ?? lifecycle.delete_after_archive);
  if (Number(lifecycle.stats.eligible_rows || 0) <= 0) throw new Error('当前没有达到归档条件的审计日志');
  const archiveBefore = lifecycle.archive_before;
  const request_json = {
    archive_before: archiveBefore,
    archive_after_days: archiveAfterDays,
    max_rows: maxRows,
    delete_after_export: deleteAfterExport,
    reason: String(input.reason || 'audit_archive'),
    stats_snapshot: lifecycle.stats,
  };
  const id = await createAsyncJob(db, {
    job_type: 'AUDIT_ARCHIVE_EXPORT',
    created_by: input.created_by ?? null,
    created_by_name: input.created_by_name ?? null,
    permission_scope: 'audit_export',
    request_json,
    retain_days: clampInt(input.retain_days, 30, 7, 90),
    max_retries: 1,
  }, bucket);
  return { id, request_json, lifecycle };
}

export async function maybeRunAuditArchiveMaintenance(db: D1Database, bucket?: any) {
  if (!bucket) return { scheduled: false, reason: 'no_bucket' as const };
  if (await hasPendingArchiveJob(db)) return { scheduled: false, reason: 'pending_job' as const };
  const lifecycle = await getAuditLifecycle(db, { forceRefreshStats: true });
  if (!lifecycle.archive_enabled) return { scheduled: false, reason: 'disabled' as const, lifecycle };
  if (Number(lifecycle.stats.eligible_rows || 0) <= 0) return { scheduled: false, reason: 'no_candidates' as const, lifecycle };
  const lastArchiveMs = Date.parse(String(lifecycle.last_archive_at || ''));
  if (Number.isFinite(lastArchiveMs) && Date.now() - lastArchiveMs < ARCHIVE_JOB_COOLDOWN_MS) {
    return { scheduled: false, reason: 'cooldown' as const, lifecycle };
  }
  const shouldArchive = lifecycle.warnings.some((item) => ['db_size', 'audit_rows', 'audit_bytes'].includes(String(item.code)))
    || Number(lifecycle.stats.eligible_rows || 0) >= Number(lifecycle.max_archive_rows || 0);
  if (!shouldArchive) return { scheduled: false, reason: 'below_threshold' as const, lifecycle };
  const created = await createAuditArchiveJob(db, {
    archive_after_days: lifecycle.archive_after_days,
    max_rows: lifecycle.max_archive_rows,
    delete_after_export: lifecycle.delete_after_archive,
    retain_days: 30,
    reason: 'scheduled_audit_archive',
  }, bucket);
  await processAsyncJob(db, created.id, bucket);
  return { scheduled: true, job_id: created.id, lifecycle };
}

export async function getAuditArchiveAdminSummary(db: D1Database) {
  const lifecycle = await getAuditLifecycle(db, { forceRefreshStats: true });
  const runs = await listAuditArchiveRuns(db, 10);
  return { ...lifecycle, archive_runs: runs };
}
