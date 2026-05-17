import type { AuthUser } from '../_auth';
import { sqlNowStored } from './_time';
import { normalizeSearchText } from './_search';

const DEFAULT_RETENTION_DAYS = 180;
const DEFAULT_ARCHIVE_AFTER_DAYS = 90;
const DEFAULT_MAX_ARCHIVE_ROWS = 5000;
const DEFAULT_WARN_DB_SIZE_MB = 350;
const DEFAULT_WARN_AUDIT_ROWS = 200000;
const DEFAULT_WARN_AUDIT_BYTES_MB = 128;
const CLEANUP_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 2000;
const STATS_REFRESH_MS = 60 * 60 * 1000;

export type AuditModuleCode = 'STOCK' | 'STOCKTAKE' | 'ITEM' | 'USER' | 'AUDIT' | 'ADMIN' | 'PC' | 'MONITOR' | 'OTHER';

type AuditRetentionStateRow = {
  id: number;
  retention_days: number;
  last_cleanup_at: string | null;
  archive_enabled: number;
  archive_after_days: number;
  delete_after_archive: number;
  max_archive_rows: number;
  warn_db_size_mb: number;
  warn_audit_rows: number;
  warn_audit_bytes_mb: number;
  last_archive_at: string | null;
  last_archive_before: string | null;
  last_archive_deleted_rows: number;
  stats_updated_at: string | null;
  stats_total_rows: number;
  stats_eligible_rows: number;
  stats_approx_bytes: number;
  stats_eligible_bytes: number;
  stats_oldest_at: string | null;
  stats_newest_at: string | null;
  stats_db_size_bytes: number;
};

export type AuditStorageStats = {
  total_rows: number;
  eligible_rows: number;
  approx_bytes: number;
  eligible_bytes: number;
  oldest_at: string | null;
  newest_at: string | null;
  db_size_bytes: number;
  db_size_mb: number;
  approx_audit_mb: number;
  eligible_audit_mb: number;
  updated_at: string | null;
};

export type AuditLifecycleInfo = {
  retention_days: number;
  last_cleanup_at: string | null;
  archive_enabled: boolean;
  archive_after_days: number;
  delete_after_archive: boolean;
  max_archive_rows: number;
  warn_db_size_mb: number;
  warn_audit_rows: number;
  warn_audit_bytes_mb: number;
  last_archive_at: string | null;
  last_archive_before: string | null;
  last_archive_deleted_rows: number;
  archive_before: string;
  stats: AuditStorageStats;
  warnings: Array<{ code: string; message: string }>;
};

function clampInt(value: any, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function boolToNumber(value: any, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback ? 1 : 0;
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  return 0;
}

function toMs(value: any) {
  if (!value) return 0;
  const ts = Date.parse(String(value));
  return Number.isFinite(ts) ? ts : 0;
}

function formatStoredDateTime(input: Date) {
  const y = input.getUTCFullYear();
  const m = String(input.getUTCMonth() + 1).padStart(2, '0');
  const d = String(input.getUTCDate()).padStart(2, '0');
  const hh = String(input.getUTCHours()).padStart(2, '0');
  const mm = String(input.getUTCMinutes()).padStart(2, '0');
  const ss = String(input.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function buildArchiveBeforeText(days: number) {
  const dt = new Date(Date.now() + 8 * 60 * 60 * 1000 - days * 24 * 60 * 60 * 1000);
  return formatStoredDateTime(dt);
}

function approxAuditBytesExpr(alias = '') {
  const p = alias ? `${alias}.` : '';
  return [
    `COALESCE(LENGTH(${p}payload_json),0)`,
    `COALESCE(LENGTH(${p}summary_text),0)`,
    `COALESCE(LENGTH(${p}search_text_norm),0)`,
    `COALESCE(LENGTH(${p}target_name),0)`,
    `COALESCE(LENGTH(${p}target_code),0)`,
    `COALESCE(LENGTH(${p}action),0)`,
    `COALESCE(LENGTH(${p}entity),0)`,
    `COALESCE(LENGTH(${p}entity_id),0)`,
    `COALESCE(LENGTH(${p}username),0)`
  ].join(' + ');
}

function mapStateRow(row: any): AuditRetentionStateRow {
  return {
    id: 1,
    retention_days: clampInt(row?.retention_days, DEFAULT_RETENTION_DAYS, 1, 3650),
    last_cleanup_at: row?.last_cleanup_at || null,
    archive_enabled: boolToNumber(row?.archive_enabled, 0),
    archive_after_days: clampInt(row?.archive_after_days, DEFAULT_ARCHIVE_AFTER_DAYS, 1, 3650),
    delete_after_archive: boolToNumber(row?.delete_after_archive, 0),
    max_archive_rows: clampInt(row?.max_archive_rows, DEFAULT_MAX_ARCHIVE_ROWS, 100, 50000),
    warn_db_size_mb: clampInt(row?.warn_db_size_mb, DEFAULT_WARN_DB_SIZE_MB, 64, 4096),
    warn_audit_rows: clampInt(row?.warn_audit_rows, DEFAULT_WARN_AUDIT_ROWS, 1000, 5000000),
    warn_audit_bytes_mb: clampInt(row?.warn_audit_bytes_mb, DEFAULT_WARN_AUDIT_BYTES_MB, 16, 4096),
    last_archive_at: row?.last_archive_at || null,
    last_archive_before: row?.last_archive_before || null,
    last_archive_deleted_rows: clampInt(row?.last_archive_deleted_rows, 0, 0, 100000000),
    stats_updated_at: row?.stats_updated_at || null,
    stats_total_rows: clampInt(row?.stats_total_rows, 0, 0, 100000000),
    stats_eligible_rows: clampInt(row?.stats_eligible_rows, 0, 0, 100000000),
    stats_approx_bytes: clampInt(row?.stats_approx_bytes, 0, 0, Number.MAX_SAFE_INTEGER),
    stats_eligible_bytes: clampInt(row?.stats_eligible_bytes, 0, 0, Number.MAX_SAFE_INTEGER),
    stats_oldest_at: row?.stats_oldest_at || null,
    stats_newest_at: row?.stats_newest_at || null,
    stats_db_size_bytes: clampInt(row?.stats_db_size_bytes, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

async function ensureRetentionState(db: D1Database): Promise<AuditRetentionStateRow> {
  const fallback = mapStateRow({
    id: 1,
    retention_days: DEFAULT_RETENTION_DAYS,
    last_cleanup_at: null,
    archive_enabled: 0,
    archive_after_days: DEFAULT_ARCHIVE_AFTER_DAYS,
    delete_after_archive: 0,
    max_archive_rows: DEFAULT_MAX_ARCHIVE_ROWS,
    warn_db_size_mb: DEFAULT_WARN_DB_SIZE_MB,
    warn_audit_rows: DEFAULT_WARN_AUDIT_ROWS,
    warn_audit_bytes_mb: DEFAULT_WARN_AUDIT_BYTES_MB,
  });
  try {
    const row = await db.prepare(
      `SELECT id, retention_days, last_cleanup_at, archive_enabled, archive_after_days, delete_after_archive,
              max_archive_rows, warn_db_size_mb, warn_audit_rows, warn_audit_bytes_mb,
              last_archive_at, last_archive_before, last_archive_deleted_rows,
              stats_updated_at, stats_total_rows, stats_eligible_rows, stats_approx_bytes,
              stats_eligible_bytes, stats_oldest_at, stats_newest_at, stats_db_size_bytes
         FROM audit_retention_state WHERE id=1`
    ).first<any>();
    if (!row) {
      await db.prepare(`INSERT OR IGNORE INTO audit_retention_state (id, retention_days, last_cleanup_at) VALUES (1, ?, NULL)`).bind(DEFAULT_RETENTION_DAYS).run();
      return fallback;
    }
    return mapStateRow(row);
  } catch {
    try {
      const row = await db.prepare(`SELECT id, retention_days, last_cleanup_at FROM audit_retention_state WHERE id=1`).first<any>();
      if (!row) {
        await db.prepare(`INSERT OR IGNORE INTO audit_retention_state (id, retention_days, last_cleanup_at) VALUES (1, ?, NULL)`).bind(DEFAULT_RETENTION_DAYS).run();
        return fallback;
      }
      return mapStateRow(row);
    } catch {
      return fallback;
    }
  }
}

async function deleteAuditRowsBefore(db: D1Database, cutoffText: string, limit = CLEANUP_BATCH_SIZE, maxRows = Number.MAX_SAFE_INTEGER) {
  let totalDeleted = 0;
  const batchSize = Math.max(100, Math.min(CLEANUP_BATCH_SIZE, clampInt(limit, CLEANUP_BATCH_SIZE, 100, CLEANUP_BATCH_SIZE)));
  while (totalDeleted < maxRows) {
    const remaining = Math.max(1, Math.min(batchSize, maxRows - totalDeleted));
    const res = await db.prepare(
      `DELETE FROM audit_log WHERE id IN (
         SELECT id FROM audit_log WHERE created_at < ? ORDER BY created_at ASC, id ASC LIMIT ?
       )`
    ).bind(cutoffText, remaining).run();
    const changes = Number((res as any)?.meta?.changes || 0);
    totalDeleted += changes;
    if (changes < remaining) break;
  }
  return totalDeleted;
}

export async function deleteAuditRowsByIds(db: D1Database, ids: number[], batchSize = 500) {
  const normalized = Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((value) => Math.trunc(Number(value || 0)))
    .filter((value) => Number.isFinite(value) && value > 0)));
  if (!normalized.length) return 0;
  let totalDeleted = 0;
  for (let index = 0; index < normalized.length; index += batchSize) {
    const chunk = normalized.slice(index, index + batchSize);
    const res = await db.prepare(`DELETE FROM audit_log WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).run();
    totalDeleted += Number((res as any)?.meta?.changes || 0);
  }
  return totalDeleted;
}

async function readDbSizeBytes(db: D1Database) {
  try {
    const pageCount = await db.prepare(`PRAGMA page_count`).first<any>();
    const pageSize = await db.prepare(`PRAGMA page_size`).first<any>();
    const count = Number(pageCount?.page_count || Object.values(pageCount || {})[0] || 0);
    const size = Number(pageSize?.page_size || Object.values(pageSize || {})[0] || 0);
    return Number.isFinite(count) && Number.isFinite(size) ? count * size : 0;
  } catch {
    return 0;
  }
}

export async function refreshAuditStorageStats(db: D1Database, options: { force?: boolean; state?: AuditRetentionStateRow | null } = {}): Promise<AuditStorageStats> {
  const state = options.state || await ensureRetentionState(db);
  const lastStatsMs = toMs(state.stats_updated_at);
  if (!options.force && lastStatsMs && Date.now() - lastStatsMs < STATS_REFRESH_MS) {
    return {
      total_rows: Number(state.stats_total_rows || 0),
      eligible_rows: Number(state.stats_eligible_rows || 0),
      approx_bytes: Number(state.stats_approx_bytes || 0),
      eligible_bytes: Number(state.stats_eligible_bytes || 0),
      oldest_at: state.stats_oldest_at || null,
      newest_at: state.stats_newest_at || null,
      db_size_bytes: Number(state.stats_db_size_bytes || 0),
      db_size_mb: Number((Number(state.stats_db_size_bytes || 0) / 1024 / 1024).toFixed(2)),
      approx_audit_mb: Number((Number(state.stats_approx_bytes || 0) / 1024 / 1024).toFixed(2)),
      eligible_audit_mb: Number((Number(state.stats_eligible_bytes || 0) / 1024 / 1024).toFixed(2)),
      updated_at: state.stats_updated_at || null,
    };
  }
  const cutoff = buildArchiveBeforeText(Number(state.archive_after_days || DEFAULT_ARCHIVE_AFTER_DAYS));
  const row = await db.prepare(
    `SELECT
       COUNT(*) AS total_rows,
       MIN(created_at) AS oldest_at,
       MAX(created_at) AS newest_at,
       SUM(${approxAuditBytesExpr()}) AS approx_bytes,
       SUM(CASE WHEN created_at < ? THEN 1 ELSE 0 END) AS eligible_rows,
       SUM(CASE WHEN created_at < ? THEN ${approxAuditBytesExpr()} ELSE 0 END) AS eligible_bytes
     FROM audit_log`
  ).bind(cutoff, cutoff).first<any>().catch(() => ({}));
  const dbSizeBytes = await readDbSizeBytes(db);
  const stats: AuditStorageStats = {
    total_rows: clampInt(row?.total_rows, 0, 0, 100000000),
    eligible_rows: clampInt(row?.eligible_rows, 0, 0, 100000000),
    approx_bytes: clampInt(row?.approx_bytes, 0, 0, Number.MAX_SAFE_INTEGER),
    eligible_bytes: clampInt(row?.eligible_bytes, 0, 0, Number.MAX_SAFE_INTEGER),
    oldest_at: row?.oldest_at || null,
    newest_at: row?.newest_at || null,
    db_size_bytes: dbSizeBytes,
    db_size_mb: Number((dbSizeBytes / 1024 / 1024).toFixed(2)),
    approx_audit_mb: Number((clampInt(row?.approx_bytes, 0, 0, Number.MAX_SAFE_INTEGER) / 1024 / 1024).toFixed(2)),
    eligible_audit_mb: Number((clampInt(row?.eligible_bytes, 0, 0, Number.MAX_SAFE_INTEGER) / 1024 / 1024).toFixed(2)),
    updated_at: new Date().toISOString(),
  };
  try {
    await db.prepare(
      `UPDATE audit_retention_state
          SET stats_updated_at=${sqlNowStored()},
              stats_total_rows=?,
              stats_eligible_rows=?,
              stats_approx_bytes=?,
              stats_eligible_bytes=?,
              stats_oldest_at=?,
              stats_newest_at=?,
              stats_db_size_bytes=?
        WHERE id=1`
    ).bind(stats.total_rows, stats.eligible_rows, stats.approx_bytes, stats.eligible_bytes, stats.oldest_at, stats.newest_at, stats.db_size_bytes).run();
  } catch {
    // ignore before migration is applied
  }
  return stats;
}

function buildAuditWarnings(state: AuditRetentionStateRow, stats: AuditStorageStats) {
  const warnings: Array<{ code: string; message: string }> = [];
  if (stats.db_size_mb >= Number(state.warn_db_size_mb || DEFAULT_WARN_DB_SIZE_MB)) {
    warnings.push({ code: 'db_size', message: `数据库体积约 ${stats.db_size_mb} MB，已超过预警值 ${state.warn_db_size_mb} MB` });
  }
  if (stats.total_rows >= Number(state.warn_audit_rows || DEFAULT_WARN_AUDIT_ROWS)) {
    warnings.push({ code: 'audit_rows', message: `审计日志行数 ${stats.total_rows}，已超过预警值 ${state.warn_audit_rows}` });
  }
  if (stats.approx_audit_mb >= Number(state.warn_audit_bytes_mb || DEFAULT_WARN_AUDIT_BYTES_MB)) {
    warnings.push({ code: 'audit_bytes', message: `审计日志估算体积约 ${stats.approx_audit_mb} MB，已超过预警值 ${state.warn_audit_bytes_mb} MB` });
  }
  if (stats.eligible_rows > 0) {
    warnings.push({ code: 'archive_candidates', message: `有 ${stats.eligible_rows} 条审计日志已达到归档门槛（约 ${stats.eligible_audit_mb} MB）` });
  }
  return warnings;
}

async function maybeCleanupAudit(db: D1Database) {
  try {
    await runAuditCleanupIfDue(db);
  } catch {
    // do not block business flows
  }
}

function normalizeAuditActionPart(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeAuditAction(action: string) {
  const normalized = normalizeAuditActionPart(action).toUpperCase();
  return normalized || 'UNKNOWN';
}

export function resolveAuditModuleCode(action: string | null | undefined, entity: string | null | undefined): AuditModuleCode {
  const actionUpper = String(action || '').trim().toUpperCase();
  const entityLower = String(entity || '').trim().toLowerCase();
  if (actionUpper.startsWith('STOCKTAKE') || entityLower.includes('stocktake')) return 'STOCKTAKE';
  if (actionUpper.startsWith('STOCK_') || ['stock', 'stock_tx'].includes(entityLower)) return 'STOCK';
  if (actionUpper.startsWith('ITEM_') || entityLower === 'items') return 'ITEM';
  if (actionUpper.startsWith('USER_') || entityLower === 'users') return 'USER';
  if (actionUpper.startsWith('AUDIT_') || entityLower === 'audit_log') return 'AUDIT';
  if (actionUpper.startsWith('ADMIN_') || ['restore_job', 'backup', 'schema'].includes(entityLower)) return 'ADMIN';
  if (actionUpper.startsWith('PC_') || entityLower.startsWith('pc_')) return 'PC';
  if (actionUpper.startsWith('MONITOR_') || entityLower.startsWith('monitor_')) return 'MONITOR';
  return 'OTHER';
}

export function isAuditHighRisk(action: string | null | undefined) {
  const actionUpper = String(action || '').trim().toUpperCase();
  return Number(
    actionUpper.includes('DELETE')
      || actionUpper.includes('ARCHIVE')
      || actionUpper.includes('SCRAP')
      || actionUpper.includes('ROLLBACK')
      || actionUpper.includes('RESET_PASSWORD')
      || actionUpper.includes('RESTORE')
      || actionUpper.includes('CLEAR')
  );
}

function pickFirstText(...values: any[]) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return null;
}

function isPlainObject(value: any) {
  return !!value && Object.prototype.toString.call(value) === '[object Object]';
}

function isHiddenDiffKey(path: string) {
  const lower = String(path || '').toLowerCase();
  return ['password', 'password_hash', 'hashed_password', 'reset_password'].some((token) => lower.includes(token));
}

function flattenAuditValue(value: any, prefix = '', depth = 0, out: Record<string, any> = {}) {
  if (!prefix && !isPlainObject(value)) return out;
  if (depth >= 2 || value === null || Array.isArray(value) || !isPlainObject(value)) {
    if (prefix) out[prefix] = value;
    return out;
  }
  const entries = Object.entries(value);
  if (!entries.length && prefix) {
    out[prefix] = value;
    return out;
  }
  for (const [key, child] of entries) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isHiddenDiffKey(path)) continue;
    if (isPlainObject(child) && depth < 2) flattenAuditValue(child, path, depth + 1, out);
    else out[path] = child;
  }
  return out;
}

function buildAuditFieldDiffs(payload: any) {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') return null;
  if (Array.isArray(payload.field_diffs) && payload.field_diffs.length) return payload.field_diffs;
  const before = payload.before;
  const after = payload.after;
  if (!isPlainObject(before) || !isPlainObject(after)) return null;
  const flatBefore = flattenAuditValue(before);
  const flatAfter = flattenAuditValue(after);
  const keys = Array.from(new Set([...Object.keys(flatBefore), ...Object.keys(flatAfter)])).filter((key) => !isHiddenDiffKey(key));
  const diffs = keys.map((key) => ({ key, before: flatBefore[key] ?? null, after: flatAfter[key] ?? null }))
    .filter((item) => JSON.stringify(item.before ?? null) !== JSON.stringify(item.after ?? null));
  return diffs.length ? diffs : null;
}

function enrichAuditPayload(payload: any) {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') return payload;
  const fieldDiffs = buildAuditFieldDiffs(payload);
  if (!fieldDiffs?.length) return payload;
  return { ...payload, field_diffs: fieldDiffs };
}

export function materializeAuditFields(action: string, entity: string | null | undefined, entityId: string | number | null | undefined, payload?: any) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const after = p.after && typeof p.after === 'object' ? p.after : {};
  const before = p.before && typeof p.before === 'object' ? p.before : {};
  const targetName = pickFirstText(
    p.target_name,
    p.item_name,
    p.user_name,
    after.name,
    after.username,
    after.employee_name,
    after.model,
    p.name,
    p.username,
    p.employee_name,
    before.name,
    before.username,
    before.employee_name,
  );
  const targetCode = pickFirstText(
    p.target_code,
    after.asset_code,
    after.serial_no,
    after.employee_no,
    p.asset_code,
    p.serial_no,
    p.employee_no,
    p.tx_no,
    p.out_no,
    p.in_no,
    p.recycle_no,
    p.scrap_no,
    entityId,
  );
  const summaryText = pickFirstText(
    p.summary_text,
    p.summary,
    p.reason,
    p.message,
    `${normalizeAuditAction(action)} ${pickFirstText(targetName, targetCode, entity, '')}`.trim(),
  );
  const searchText = normalizeSearchText(action, entity, entityId, targetName, targetCode, summaryText, p.username, p.item_name, p.user_name);
  return {
    target_name: targetName,
    target_code: targetCode,
    summary_text: summaryText,
    search_text_norm: searchText,
  };
}

function getIp(request: Request) {
  const h = request.headers;
  const cf = h.get('CF-Connecting-IP') || h.get('cf-connecting-ip');
  const xff = h.get('x-forwarded-for');
  if (cf) return cf;
  if (xff) return xff.split(',')[0].trim();
  return null;
}

export async function logAudit(
  db: D1Database,
  request: Request,
  user: AuthUser | null,
  action: string,
  entity?: string | null,
  entity_id?: string | number | null,
  payload?: any,
) {
  try {
    const normalizedAction = normalizeAuditAction(action);
    const normalizedEntity = entity ?? null;
    const ip = getIp(request);
    const ua = request.headers.get('user-agent');
    const enrichedPayload = enrichAuditPayload(payload);
    const payload_json = enrichedPayload === undefined ? null : JSON.stringify(enrichedPayload);
    const materialized = materializeAuditFields(normalizedAction, normalizedEntity, entity_id, enrichedPayload);
    await db.prepare(
      `INSERT INTO audit_log (
         user_id, username, action, entity, entity_id, payload_json, ip, ua,
         module_code, high_risk, target_name, target_code, summary_text, search_text_norm, created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
    ).bind(
      user?.id ?? null,
      user?.username ?? null,
      normalizedAction,
      normalizedEntity,
      entity_id === undefined || entity_id === null ? null : String(entity_id),
      payload_json,
      ip,
      ua,
      resolveAuditModuleCode(normalizedAction, normalizedEntity),
      isAuditHighRisk(normalizedAction),
      materialized.target_name,
      materialized.target_code,
      materialized.summary_text,
      materialized.search_text_norm,
    ).run();
    await maybeCleanupAudit(db);
  } catch {
    // best-effort audit; do not block business flows
  }
}

export async function getAuditLifecycle(db: D1Database, options: { forceRefreshStats?: boolean } = {}): Promise<AuditLifecycleInfo> {
  const state = await ensureRetentionState(db);
  const stats = await refreshAuditStorageStats(db, { force: options.forceRefreshStats, state });
  return {
    retention_days: Number(state.retention_days || DEFAULT_RETENTION_DAYS),
    last_cleanup_at: state.last_cleanup_at || null,
    archive_enabled: Number(state.archive_enabled || 0) === 1,
    archive_after_days: Number(state.archive_after_days || DEFAULT_ARCHIVE_AFTER_DAYS),
    delete_after_archive: Number(state.delete_after_archive || 0) === 1,
    max_archive_rows: Number(state.max_archive_rows || DEFAULT_MAX_ARCHIVE_ROWS),
    warn_db_size_mb: Number(state.warn_db_size_mb || DEFAULT_WARN_DB_SIZE_MB),
    warn_audit_rows: Number(state.warn_audit_rows || DEFAULT_WARN_AUDIT_ROWS),
    warn_audit_bytes_mb: Number(state.warn_audit_bytes_mb || DEFAULT_WARN_AUDIT_BYTES_MB),
    last_archive_at: state.last_archive_at || null,
    last_archive_before: state.last_archive_before || null,
    last_archive_deleted_rows: Number(state.last_archive_deleted_rows || 0),
    archive_before: buildArchiveBeforeText(Number(state.archive_after_days || DEFAULT_ARCHIVE_AFTER_DAYS)),
    stats,
    warnings: buildAuditWarnings(state, stats),
  };
}

export async function getAuditRetention(db: D1Database) {
  return getAuditLifecycle(db, { forceRefreshStats: false });
}

export async function setAuditRetention(db: D1Database, retention_days: number) {
  await ensureRetentionState(db);
  const days = clampInt(retention_days, DEFAULT_RETENTION_DAYS, 1, 3650);
  await db.prepare('UPDATE audit_retention_state SET retention_days=? WHERE id=1').bind(days).run();
  return days;
}

export async function setAuditLifecycle(db: D1Database, input: Partial<{ retention_days: number; archive_enabled: boolean | number; archive_after_days: number; delete_after_archive: boolean | number; max_archive_rows: number; warn_db_size_mb: number; warn_audit_rows: number; warn_audit_bytes_mb: number; }>) {
  await ensureRetentionState(db);
  const next = {
    retention_days: clampInt(input.retention_days, DEFAULT_RETENTION_DAYS, 1, 3650),
    archive_enabled: boolToNumber(input.archive_enabled, 0),
    archive_after_days: clampInt(input.archive_after_days, DEFAULT_ARCHIVE_AFTER_DAYS, 1, 3650),
    delete_after_archive: boolToNumber(input.delete_after_archive, 0),
    max_archive_rows: clampInt(input.max_archive_rows, DEFAULT_MAX_ARCHIVE_ROWS, 100, 50000),
    warn_db_size_mb: clampInt(input.warn_db_size_mb, DEFAULT_WARN_DB_SIZE_MB, 64, 4096),
    warn_audit_rows: clampInt(input.warn_audit_rows, DEFAULT_WARN_AUDIT_ROWS, 1000, 5000000),
    warn_audit_bytes_mb: clampInt(input.warn_audit_bytes_mb, DEFAULT_WARN_AUDIT_BYTES_MB, 16, 4096),
  };
  await db.prepare(
    `UPDATE audit_retention_state
        SET retention_days=?,
            archive_enabled=?,
            archive_after_days=?,
            delete_after_archive=?,
            max_archive_rows=?,
            warn_db_size_mb=?,
            warn_audit_rows=?,
            warn_audit_bytes_mb=?
      WHERE id=1`
  ).bind(
    next.retention_days,
    next.archive_enabled,
    next.archive_after_days,
    next.delete_after_archive,
    next.max_archive_rows,
    next.warn_db_size_mb,
    next.warn_audit_rows,
    next.warn_audit_bytes_mb,
  ).run();
  return getAuditLifecycle(db, { forceRefreshStats: true });
}

export async function runAuditCleanup(db: D1Database, options: { force?: boolean; maxRows?: number } = {}) {
  const st = await ensureRetentionState(db);
  const days = clampInt(st.retention_days, DEFAULT_RETENTION_DAYS, 1, 3650);
  const cutoffText = buildArchiveBeforeText(days);
  const deleted = await deleteAuditRowsBefore(db, cutoffText, CLEANUP_BATCH_SIZE, Math.max(1, Number(options.maxRows || Number.MAX_SAFE_INTEGER)));
  await db.prepare(`UPDATE audit_retention_state SET last_cleanup_at = ${sqlNowStored()} WHERE id=1`).run();
  await refreshAuditStorageStats(db, { force: true, state: await ensureRetentionState(db) }).catch(() => {});
  return { days, deleted, before: cutoffText };
}

export async function runAuditCleanupIfDue(db: D1Database, options: { force?: boolean } = {}) {
  const st = await ensureRetentionState(db);
  const lastMs = toMs(st.last_cleanup_at);
  if (!options.force && lastMs && Date.now() - lastMs < CLEANUP_COOLDOWN_MS) {
    return { skipped: true, reason: 'cooldown', last_cleanup_at: st.last_cleanup_at || null };
  }
  const result = await runAuditCleanup(db, { force: options.force });
  return { skipped: false, ...result };
}

export async function recordAuditArchiveRun(db: D1Database, input: { job_id?: number | null; archive_before: string; exported_rows: number; deleted_rows?: number; result_object_key?: string | null; result_filename?: string | null; result_file_size?: number | null; content_type?: string | null; status?: string | null; message?: string | null; }) {
  try {
    await db.prepare(
      `INSERT INTO audit_archive_runs (
         job_id, archive_before, exported_rows, deleted_rows, result_object_key, result_filename,
         result_file_size, content_type, status, message, created_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
    ).bind(
      input.job_id ?? null,
      input.archive_before,
      clampInt(input.exported_rows, 0, 0, 100000000),
      clampInt(input.deleted_rows, 0, 0, 100000000),
      input.result_object_key ?? null,
      input.result_filename ?? null,
      clampInt(input.result_file_size, 0, 0, Number.MAX_SAFE_INTEGER),
      input.content_type ?? null,
      input.status ?? 'success',
      input.message ?? null,
    ).run();
    await db.prepare(
      `UPDATE audit_retention_state
          SET last_archive_at=${sqlNowStored()},
              last_archive_before=?,
              last_archive_deleted_rows=?
        WHERE id=1`
    ).bind(input.archive_before, clampInt(input.deleted_rows, 0, 0, 100000000)).run();
  } catch {
    // ignore before migration is applied
  }
  await refreshAuditStorageStats(db, { force: true }).catch(() => {});
}

export async function listAuditArchiveRuns(db: D1Database, limit = 20) {
  try {
    const { results } = await db.prepare(
      `SELECT id, job_id, archive_before, exported_rows, deleted_rows, result_object_key, result_filename,
              result_file_size, content_type, status, message, created_at
         FROM audit_archive_runs
        ORDER BY id DESC
        LIMIT ?`
    ).bind(clampInt(limit, 20, 1, 100)).all<any>();
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}
