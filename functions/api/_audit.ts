import type { AuthUser } from "../_auth";

const DEFAULT_RETENTION_DAYS = 180;
const CLEANUP_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12h

async function ensureRetentionState(db: D1Database) {
  // self-heal: allow project upgrades without running migration first
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS audit_retention_state (
       id INTEGER PRIMARY KEY CHECK(id=1),
       retention_days INTEGER NOT NULL DEFAULT ${DEFAULT_RETENTION_DAYS},
       last_cleanup_at TEXT
     )`
  ).run();
  const row = await db.prepare("SELECT id, retention_days, last_cleanup_at FROM audit_retention_state WHERE id=1").first<any>();
  if (!row) {
    await db.prepare("INSERT INTO audit_retention_state (id, retention_days, last_cleanup_at) VALUES (1, ?, NULL)")
      .bind(DEFAULT_RETENTION_DAYS)
      .run();
    return { id: 1, retention_days: DEFAULT_RETENTION_DAYS, last_cleanup_at: null as string | null };
  }
  return row;
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

    // created_at is stored as ISO-like text; SQLite datetime('now') is UTC.
    await db.prepare(
      "DELETE FROM audit_log WHERE created_at < datetime('now', '-' || ? || ' days')"
    ).bind(days).run();
    await db.prepare("UPDATE audit_retention_state SET last_cleanup_at = datetime('now') WHERE id=1").run();
  } catch {
    // do not block business flows
  }
}

function getIp(request: Request) {
  const h = request.headers;
  const cf = h.get("CF-Connecting-IP") || h.get("cf-connecting-ip");
  const xff = h.get("x-forwarded-for");
  if (cf) return cf;
  if (xff) return xff.split(",")[0].trim();
  return null;
}

export async function logAudit(
  db: D1Database,
  request: Request,
  user: AuthUser | null,
  action: string,
  entity?: string | null,
  entity_id?: string | number | null,
  payload?: any
) {
  try {
    const ip = getIp(request);
    const ua = request.headers.get("user-agent");
    const payload_json = payload === undefined ? null : JSON.stringify(payload);
    await db.prepare(
      `INSERT INTO audit_log (user_id, username, action, entity, entity_id, payload_json, ip, ua)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(
      user?.id ?? null,
      user?.username ?? null,
      action,
      entity ?? null,
      entity_id === undefined || entity_id === null ? null : String(entity_id),
      payload_json,
      ip,
      ua
    ).run();

    // best-effort retention cleanup (low-frequency)
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
  await db.prepare("UPDATE audit_retention_state SET retention_days=? WHERE id=1").bind(days).run();
  return days;
}

export async function runAuditCleanup(db: D1Database) {
  const st = await ensureRetentionState(db);
  const days = Math.max(1, Math.min(3650, Number(st?.retention_days || DEFAULT_RETENTION_DAYS)));
  const res = await db.prepare(
    "DELETE FROM audit_log WHERE created_at < datetime('now', '-' || ? || ' days')"
  ).bind(days).run();
  await db.prepare("UPDATE audit_retention_state SET last_cleanup_at = datetime('now') WHERE id=1").run();
  return { days, deleted: Number((res as any)?.meta?.changes || 0) };
}
