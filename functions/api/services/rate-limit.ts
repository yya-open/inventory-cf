import { sqlNowStored, sqlStoredHoursAgo, sqlStoredMinutesAgo, sqlStoredMinutesFromNow } from '../_time';

export function getClientIp(request: Request) {
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '';
  return ip || '0.0.0.0';
}

export function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function datetimeTextToMsBj(dt: string | null) {
  if (!dt) return null;
  const iso = dt.replace(' ', 'T') + '+08:00';
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export async function ensureAuthLoginThrottleTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS auth_login_throttle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      username TEXT NOT NULL,
      fail_count INTEGER NOT NULL DEFAULT 0,
      first_fail_at TEXT,
      last_fail_at TEXT,
      locked_until TEXT,
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      UNIQUE(ip, username)
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_locked ON auth_login_throttle(locked_until)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_ip_username_locked ON auth_login_throttle(ip, username, locked_until)`).run();
}

export async function ensurePublicThrottleTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS public_api_throttle (
      k TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_public_api_throttle_updated_at ON public_api_throttle(updated_at)`).run();
}

export async function cleanupPublicThrottleBuckets(db: D1Database, maxAgeHours = 2) {
  await db.prepare(`DELETE FROM public_api_throttle WHERE updated_at < ${sqlStoredHoursAgo(maxAgeHours)}`).run();
}

export async function incrementPublicThrottleBucket(db: D1Database, key: string) {
  await db.prepare(
    `INSERT INTO public_api_throttle (k, count) VALUES (?, 1)
     ON CONFLICT(k) DO UPDATE SET count = count + 1, updated_at = ${sqlNowStored()}`
  ).bind(key).run();
  return await db.prepare(`SELECT count, updated_at FROM public_api_throttle WHERE k=?`).bind(key).first<any>();
}

export async function getRecentAuthFailCount(db: D1Database, ip: string, username: string, windowMin: number) {
  try {
    const r = await db.prepare(
      `SELECT fail_count, last_fail_at
       FROM auth_login_throttle
       WHERE ip=? AND username=?`
    ).bind(ip, username).first<any>();
    if (!r) return 0;
    const last = r.last_fail_at as string | null;
    if (!last) return 0;
    const ms = datetimeTextToMsBj(last);
    if (!Number.isFinite(ms)) return 0;
    if (Date.now() - ms > windowMin * 60_000) return 0;
    return Number(r.fail_count) || 0;
  } catch (e: any) {
    if (String(e?.message || '').includes('no such table')) return 0;
    throw e;
  }
}

export async function getAuthLockedUntil(db: D1Database, ip: string, username: string) {
  try {
    const r = await db.prepare(
      `SELECT MAX(locked_until) AS locked_until
       FROM auth_login_throttle
       WHERE ip=?
         AND (username=? OR username='*')
         AND locked_until IS NOT NULL
         AND locked_until > ${sqlNowStored()}`
    ).bind(ip, username).first<any>();
    return (r?.locked_until as string | null) || null;
  } catch (e: any) {
    if (String(e?.message || '').includes('no such table')) return null;
    throw e;
  }
}

export async function bumpAuthFail(
  db: D1Database,
  ip: string,
  username: string,
  maxFails: number,
  windowMin: number,
  lockMin: number,
  lockEnabled = true,
) {
  const sql = `
    INSERT INTO auth_login_throttle (ip, username, fail_count, first_fail_at, last_fail_at, locked_until, updated_at)
    VALUES (?, ?, 1, ${sqlNowStored()}, ${sqlNowStored()},
            CASE WHEN ${lockEnabled ? 1 : 0}=1 AND 1 >= ${maxFails} THEN ${sqlStoredMinutesFromNow(lockMin)} ELSE NULL END,
            ${sqlNowStored()})
    ON CONFLICT(ip, username) DO UPDATE SET
      fail_count = CASE
        WHEN auth_login_throttle.last_fail_at IS NULL
          OR auth_login_throttle.last_fail_at < ${sqlStoredMinutesAgo(windowMin)}
        THEN 1
        ELSE auth_login_throttle.fail_count + 1
      END,
      first_fail_at = CASE
        WHEN auth_login_throttle.last_fail_at IS NULL
          OR auth_login_throttle.last_fail_at < ${sqlStoredMinutesAgo(windowMin)}
        THEN ${sqlNowStored()}
        ELSE auth_login_throttle.first_fail_at
      END,
      last_fail_at = ${sqlNowStored()},
      locked_until = CASE
        WHEN (
          CASE
            WHEN auth_login_throttle.last_fail_at IS NULL
              OR auth_login_throttle.last_fail_at < ${sqlStoredMinutesAgo(windowMin)}
            THEN 1
            ELSE auth_login_throttle.fail_count + 1
          END
        ) >= ${maxFails} AND ${lockEnabled ? 1 : 0}=1
        THEN ${sqlStoredMinutesFromNow(lockMin)}
        ELSE NULL
      END,
      updated_at = ${sqlNowStored()};
  `;

  try {
    await db.prepare(sql).bind(ip, username).run();
  } catch (e: any) {
    if (String(e?.message || '').includes('no such table')) return;
    throw e;
  }
}

export async function clearAuthFail(db: D1Database, ip: string, username: string) {
  try {
    await db.prepare(
      `DELETE FROM auth_login_throttle WHERE ip=? AND (username=? OR username='*')`
    ).bind(ip, username).run();
  } catch (e: any) {
    if (String(e?.message || '').includes('no such table')) return;
    throw e;
  }
}
