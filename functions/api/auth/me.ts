import { json, requireAuth, errorResponse } from "../../_auth";
import { getUserPermissionMap, getUserTemplateCode } from '../../_permissions';
import { getUserDataScope } from '../services/data-scope';

type MePayload = { user: any };
const ME_CACHE_TTL_MS = 30 * 60_000;
const meCache = new Map<number, { expiresAt: number; payload: MePayload }>();
let meTableEnsured = false;
let meTableEnsuring: Promise<void> | null = null;

async function ensureMeHotCacheTable(db: D1Database) {
  if (meTableEnsured) return;
  if (meTableEnsuring) return meTableEnsuring;
  meTableEnsuring = db.prepare(
    `CREATE TABLE IF NOT EXISTS me_hot_cache (
      user_id INTEGER PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','+8 hours'))
    )`
  ).run().then(() => {
    meTableEnsured = true;
  }).catch(() => {
    // best effort
  }).finally(() => {
    meTableEnsuring = null;
  });
  return meTableEnsuring;
}

async function readMeHotCache(db: D1Database, userId: number) {
  try {
    const row = await db.prepare('SELECT payload_json FROM me_hot_cache WHERE user_id=?').bind(userId).first<any>();
    const text = String(row?.payload_json || '').trim();
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed?.user || typeof parsed.user !== 'object') return null;
    return parsed as MePayload;
  } catch {
    return null;
  }
}

async function writeMeHotCache(db: D1Database, userId: number, payload: MePayload) {
  try {
    await db.prepare(
      `INSERT INTO me_hot_cache (user_id, payload_json, updated_at)
       VALUES (?, ?, datetime('now','+8 hours'))
       ON CONFLICT(user_id) DO UPDATE SET
         payload_json=excluded.payload_json,
         updated_at=datetime('now','+8 hours')`
    ).bind(userId, JSON.stringify(payload)).run();
  } catch {
    // best effort
  }
}

function readCachedMe(userId: number) {
  const entry = meCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    meCache.delete(userId);
    return null;
  }
  return entry.payload;
}

function writeCachedMe(userId: number, payload: MePayload) {
  meCache.set(userId, { expiresAt: Date.now() + ME_CACHE_TTL_MS, payload });
  return payload;
}

export function invalidateCachedMe(userId?: number | null) {
  if (typeof userId === 'number' && Number.isFinite(userId) && userId > 0) {
    meCache.delete(userId);
    return;
  }
  meCache.clear();
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const timing = (env as any).__timing;
    const user = await requireAuth(env, request, "viewer");
    const cached = readCachedMe(user.id);
    if (cached) return json(true, cached);

    if (timing?.measure) await timing.measure('auth_me_ensure_cache', () => ensureMeHotCacheTable(env.DB));
    else await ensureMeHotCacheTable(env.DB);

    const hotCached = timing?.measure
      ? await timing.measure('auth_me_hot_cache_read', () => readMeHotCache(env.DB, user.id))
      : await readMeHotCache(env.DB, user.id);
    if (hotCached) {
      writeCachedMe(user.id, hotCached);
      return json(true, hotCached);
    }

    const permission_template_code = await getUserTemplateCode(env.DB, user.id, user.role);
    const permissions = await getUserPermissionMap(env.DB, user.id, user.role, permission_template_code);
    const dataScope = await getUserDataScope(env.DB, user.id);
    const payload = writeCachedMe(user.id, { user: { ...user, permission_template_code, permissions, ...dataScope } });
    if (timing?.measure) await timing.measure('auth_me_hot_cache_write', () => writeMeHotCache(env.DB, user.id, payload));
    else await writeMeHotCache(env.DB, user.id, payload);
    return json(true, payload);
  } catch (e: any) {
    return errorResponse(e);
  }
};
