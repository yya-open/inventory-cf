import { json, requireAuth, errorResponse } from "../../_auth";
import { getUserPermissionMap, getUserTemplateCode } from '../../_permissions';
import { getUserDataScope } from '../services/data-scope';

type MePayload = { user: any };
const ME_CACHE_TTL_MS = 30 * 60_000;
const ME_HOT_CACHE_WRITE_DEBOUNCE_MS = 160;
const meCache = new Map<number, { expiresAt: number; payload: MePayload }>();
const meHotWriteQueue = new Map<number, {
  db: D1Database;
  payload: MePayload;
  aclVersion: number;
  timer: ReturnType<typeof setTimeout>;
}>();
let meTableEnsured = false;
let meTableEnsuring: Promise<void> | null = null;

type MeCacheMissReason = 'not_found' | 'expired' | 'version_mismatch' | 'invalid' | 'db_error';

function markTiming(timing: any, name: string) {
  if (!timing?.add) return;
  timing.add(name, 1);
}

async function ensureMeHotCacheTable(db: D1Database) {
  if (meTableEnsured) return;
  if (meTableEnsuring) return meTableEnsuring;
  meTableEnsuring = db.prepare(
    `CREATE TABLE IF NOT EXISTS me_hot_cache (
      user_id INTEGER PRIMARY KEY,
      payload_json TEXT NOT NULL,
      acl_version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
    )`
  ).run().then(async () => {
    try {
      await db.prepare(`ALTER TABLE me_hot_cache ADD COLUMN acl_version INTEGER NOT NULL DEFAULT 0`).run();
    } catch {
      // column already exists
    }
    meTableEnsured = true;
  }).catch(() => {
    // best effort
  }).finally(() => {
    meTableEnsuring = null;
  });
  return meTableEnsuring;
}

async function readMeHotCache(db: D1Database, userId: number, expectedAclVersion: number) {
  try {
    const row = await db.prepare('SELECT payload_json, acl_version FROM me_hot_cache WHERE user_id=?').bind(userId).first<any>();
    const text = String(row?.payload_json || '').trim();
    if (!text) return { payload: null, reason: 'not_found' as MeCacheMissReason };
    const hotAclVersion = Number(row?.acl_version || 0);
    if (hotAclVersion !== expectedAclVersion) return { payload: null, reason: 'version_mismatch' as MeCacheMissReason };
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return { payload: null, reason: 'invalid' as MeCacheMissReason };
    if (!parsed?.user || typeof parsed.user !== 'object') return { payload: null, reason: 'invalid' as MeCacheMissReason };
    return { payload: parsed as MePayload, reason: null };
  } catch {
    return { payload: null, reason: 'db_error' as MeCacheMissReason };
  }
}

async function writeMeHotCache(db: D1Database, userId: number, payload: MePayload, aclVersion: number) {
  try {
    await db.prepare(
      `INSERT INTO me_hot_cache (user_id, payload_json, acl_version, updated_at)
       VALUES (?, ?, ?, datetime('now','+8 hours'))
       ON CONFLICT(user_id) DO UPDATE SET
          payload_json=excluded.payload_json,
          acl_version=excluded.acl_version,
          updated_at=datetime('now','+8 hours')`
    ).bind(userId, JSON.stringify(payload), aclVersion).run();
  } catch {
    // best effort
  }
}

function readCachedMe(userId: number, expectedAclVersion: number) {
  const entry = meCache.get(userId);
  if (!entry) return { payload: null, reason: 'not_found' as MeCacheMissReason };
  if (entry.expiresAt <= Date.now()) {
    meCache.delete(userId);
    return { payload: null, reason: 'expired' as MeCacheMissReason };
  }
  const aclVersion = Number(entry?.payload?.user?.acl_version || 0);
  if (aclVersion !== expectedAclVersion) {
    meCache.delete(userId);
    return { payload: null, reason: 'version_mismatch' as MeCacheMissReason };
  }
  return { payload: entry.payload, reason: null };
}

function writeCachedMe(userId: number, payload: MePayload) {
  meCache.set(userId, { expiresAt: Date.now() + ME_CACHE_TTL_MS, payload });
  return payload;
}

function queueMeHotCacheWrite(db: D1Database, userId: number, payload: MePayload, aclVersion: number) {
  const queued = meHotWriteQueue.get(userId);
  if (queued) {
    queued.db = db;
    queued.payload = payload;
    queued.aclVersion = aclVersion;
    return;
  }
  const timer = setTimeout(async () => {
    const current = meHotWriteQueue.get(userId);
    if (!current) return;
    meHotWriteQueue.delete(userId);
    await writeMeHotCache(current.db, userId, current.payload, current.aclVersion);
  }, ME_HOT_CACHE_WRITE_DEBOUNCE_MS);
  meHotWriteQueue.set(userId, { db, payload, aclVersion, timer });
}

export async function invalidateCachedMe(dbOrUserId?: D1Database | number | null, maybeUserId?: number | null, reason?: string, timing?: any) {
  const db = dbOrUserId && typeof dbOrUserId === 'object' && 'prepare' in dbOrUserId ? (dbOrUserId as D1Database) : null;
  const userId = typeof dbOrUserId === 'number' ? dbOrUserId : maybeUserId;
  markTiming(timing, `auth_me_invalidate_${String(reason || 'unknown').trim() || 'unknown'}`);

  if (typeof userId === 'number' && Number.isFinite(userId) && userId > 0) {
    meCache.delete(userId);
    const queued = meHotWriteQueue.get(userId);
    if (queued) {
      clearTimeout(queued.timer);
      meHotWriteQueue.delete(userId);
    }
  } else {
    meCache.clear();
    for (const queued of meHotWriteQueue.values()) clearTimeout(queued.timer);
    meHotWriteQueue.clear();
  }

  if (!db) return;
  try {
    if (typeof userId === 'number' && Number.isFinite(userId) && userId > 0) {
      await db.prepare('DELETE FROM me_hot_cache WHERE user_id=?').bind(userId).run();
    } else {
      await db.prepare('DELETE FROM me_hot_cache').run();
    }
  } catch {
    // best effort
  }
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const timing = (env as any).__timing;
    const user = await requireAuth(env, request, "viewer");
    const expectedAclVersion = Number((user as any)?.acl_version || 0);
    const memory = readCachedMe(user.id, expectedAclVersion);
    if (memory.payload) {
      markTiming(timing, 'auth_me_cache_hit_mem');
      return json(true, memory.payload);
    }
    markTiming(timing, `auth_me_cache_miss_${memory.reason || 'not_found'}`);

    if (timing?.measure) await timing.measure('auth_me_ensure_cache', () => ensureMeHotCacheTable(env.DB));
    else await ensureMeHotCacheTable(env.DB);

    const hot = timing?.measure
      ? await timing.measure('auth_me_hot_cache_read', () => readMeHotCache(env.DB, user.id, expectedAclVersion))
      : await readMeHotCache(env.DB, user.id, expectedAclVersion);
    if (hot.payload) {
      markTiming(timing, 'auth_me_cache_hit_hot');
      writeCachedMe(user.id, hot.payload);
      return json(true, hot.payload);
    }
    markTiming(timing, `auth_me_hot_cache_miss_${hot.reason || 'not_found'}`);

    const permission_template_code = await getUserTemplateCode(env.DB, user.id, user.role);
    const permissions = await getUserPermissionMap(env.DB, user.id, user.role, permission_template_code);
    const dataScope = await getUserDataScope(env.DB, user.id);
    const payload = writeCachedMe(user.id, { user: { ...user, acl_version: expectedAclVersion, permission_template_code, permissions, ...dataScope } });
    markTiming(timing, 'auth_me_cache_rebuild');
    queueMeHotCacheWrite(env.DB, user.id, payload, expectedAclVersion);
    markTiming(timing, 'auth_me_hot_cache_write_queued');
    return json(true, payload);
  } catch (e: any) {
    return errorResponse(e);
  }
};
