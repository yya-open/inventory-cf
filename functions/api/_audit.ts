import type { AuthUser } from '../_auth';
import { sqlNowStored, sqlStoredDaysAgo } from './_time';

const DEFAULT_RETENTION_DAYS = 180;
const CLEANUP_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type AuditModuleCode = 'STOCK' | 'STOCKTAKE' | 'ITEM' | 'USER' | 'AUDIT' | 'ADMIN' | 'PC' | 'MONITOR' | 'OTHER';

async function ensureRetentionState(db: D1Database) {
  try {
    const row = await db.prepare('SELECT id, retention_days, last_cleanup_at FROM audit_retention_state WHERE id=1').first<any>();
    if (!row) {
      await db.prepare('INSERT OR IGNORE INTO audit_retention_state (id, retention_days, last_cleanup_at) VALUES (1, ?, NULL)').bind(DEFAULT_RETENTION_DAYS).run();
      return { id: 1, retention_days: DEFAULT_RETENTION_DAYS, last_cleanup_at: null as string | null };
    }
    return row;
  } catch {
    return { id: 1, retention_days: DEFAULT_RETENTION_DAYS, last_cleanup_at: null as string | null };
  }
}

function toMs(d: any) {
  if (!d) return 0;
  const t = Date.parse(String(d));
  return Number.isFinite(t) ? t : 0;
}

async function maybeCleanupAudit(db: D1Database) {
  try {
    const state = await ensureRetentionState(db);
    const lastMs = toMs(state.last_cleanup_at);
    const now = Date.now();
    if (lastMs && now - lastMs < CLEANUP_COOLDOWN_MS) return;
    const days = Math.max(1, Math.min(3650, Number(state.retention_days || DEFAULT_RETENTION_DAYS)));
    await db.prepare(`DELETE FROM audit_log WHERE created_at < ${sqlStoredDaysAgo(days)}`).run();
    await db.prepare(`UPDATE audit_retention_state SET last_cleanup_at = ${sqlNowStored()} WHERE id=1`).run();
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
    const payload_json = payload === undefined ? null : JSON.stringify(payload);
    await db.prepare(
      `INSERT INTO audit_log (user_id, username, action, entity, entity_id, payload_json, ip, ua, module_code, high_risk, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?, ${sqlNowStored()})`
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
    ).run();
    await maybeCleanupAudit(db);
  } catch {
    // best-effort audit; do not block business flows
  }
}

export async function getAuditRetention(db: D1Database) {
  const st = await ensureRetentionState(db);
  return {
    retention_days: Number(st?.retention_days || DEFAULT_RETENTION_DAYS),
    last_cleanup_at: st?.last_cleanup_at || null,
  };
}

export async function setAuditRetention(db: D1Database, retention_days: number) {
  await ensureRetentionState(db);
  const days = Math.max(1, Math.min(3650, Number(retention_days || DEFAULT_RETENTION_DAYS)));
  await db.prepare('UPDATE audit_retention_state SET retention_days=? WHERE id=1').bind(days).run();
  return days;
}

export async function runAuditCleanup(db: D1Database) {
  const st = await ensureRetentionState(db);
  const days = Math.max(1, Math.min(3650, Number(st?.retention_days || DEFAULT_RETENTION_DAYS)));
  const res = await db.prepare(`DELETE FROM audit_log WHERE created_at < ${sqlStoredDaysAgo(days)}`).run();
  await db.prepare(`UPDATE audit_retention_state SET last_cleanup_at = ${sqlNowStored()} WHERE id=1`).run();
  return { days, deleted: Number((res as any)?.meta?.changes || 0) };
}
