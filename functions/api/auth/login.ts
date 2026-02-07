import { json, signJwt, errorResponse } from "../../_auth";
import { verifyPassword } from "../../_password";

function getClientIp(request: Request) {
  // Cloudflare will set CF-Connecting-IP in production.
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  return ip || "0.0.0.0";
}

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

async function checkLocked(env: any, ip: string, username: string) {
  try {
    const r = await env.DB.prepare(
      `SELECT MAX(locked_until) AS locked_until
       FROM auth_login_throttle
       WHERE ip=?
         AND (username=? OR username='*')
         AND locked_until IS NOT NULL
         AND locked_until > datetime('now')`
    )
      .bind(ip, username)
      .first<any>();

    const locked_until = r?.locked_until as string | null;
    return locked_until || null;
  } catch (e: any) {
    // If not migrated yet, don't block login.
    if (String(e?.message || "").includes("no such table")) return null;
    throw e;
  }
}

async function bumpFail(env: any, ip: string, username: string, maxFails: number, windowMin: number, lockMin: number) {
  const sql = `
    INSERT INTO auth_login_throttle (ip, username, fail_count, first_fail_at, last_fail_at, locked_until, updated_at)
    VALUES (?, ?, 1, datetime('now'), datetime('now'),
            CASE WHEN 1 >= ${maxFails} THEN datetime('now', '+${lockMin} minutes') ELSE NULL END,
            datetime('now'))
    ON CONFLICT(ip, username) DO UPDATE SET
      fail_count = CASE
        WHEN auth_login_throttle.last_fail_at IS NULL
          OR auth_login_throttle.last_fail_at < datetime('now', '-${windowMin} minutes')
        THEN 1
        ELSE auth_login_throttle.fail_count + 1
      END,
      first_fail_at = CASE
        WHEN auth_login_throttle.last_fail_at IS NULL
          OR auth_login_throttle.last_fail_at < datetime('now', '-${windowMin} minutes')
        THEN datetime('now')
        ELSE auth_login_throttle.first_fail_at
      END,
      last_fail_at = datetime('now'),
      locked_until = CASE
        WHEN (
          CASE
            WHEN auth_login_throttle.last_fail_at IS NULL
              OR auth_login_throttle.last_fail_at < datetime('now', '-${windowMin} minutes')
            THEN 1
            ELSE auth_login_throttle.fail_count + 1
          END
        ) >= ${maxFails}
        THEN datetime('now', '+${lockMin} minutes')
        ELSE NULL
      END,
      updated_at = datetime('now');
  `;

  try {
    await env.DB.prepare(sql).bind(ip, username).run();
  } catch (e: any) {
    if (String(e?.message || "").includes("no such table")) return;
    throw e;
  }
}

async function clearFail(env: any, ip: string, username: string) {
  try {
    await env.DB.prepare(
      `DELETE FROM auth_login_throttle WHERE ip=? AND (username=? OR username='*')`
    )
      .bind(ip, username)
      .run();
  } catch (e: any) {
    if (String(e?.message || "").includes("no such table")) return;
    throw e;
  }
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const { username, password } = await request.json<any>();
    const u = (username || "").trim();
    const p = String(password || "");
    if (!u || !p) return json(false, null, "请输入账号和密码", 400);

    const ip = getClientIp(request);

    // 可选配置（Pages 环境变量）：AUTH_MAX_FAILS / AUTH_WINDOW_MIN / AUTH_LOCK_MIN
    const maxFails = clampInt((env as any).AUTH_MAX_FAILS, 5, 3, 20);
    const windowMin = clampInt((env as any).AUTH_WINDOW_MIN, 15, 1, 120);
    const lockMin = clampInt((env as any).AUTH_LOCK_MIN, 15, 1, 240);

    const lockedUntil = await checkLocked(env as any, ip, u);
    if (lockedUntil) {
      return json(false, null, `尝试次数过多，请稍后再试（锁定至 ${lockedUntil}）`, 429);
    }

    const row = await env.DB.prepare(
      "SELECT id, username, password_hash, role, is_active, must_change_password FROM users WHERE username=?"
    )
      .bind(u)
      .first<any>();

    // 统一错误信息，避免枚举账号
    if (!row || Number(row.is_active) !== 1) {
      await bumpFail(env as any, ip, u, maxFails, windowMin, lockMin);
      await bumpFail(env as any, ip, "*", maxFails, windowMin, lockMin);
      return json(false, null, "账号或密码错误", 401);
    }

    const ok = await verifyPassword(p, row.password_hash);
    if (!ok) {
      await bumpFail(env as any, ip, u, maxFails, windowMin, lockMin);
      await bumpFail(env as any, ip, "*", maxFails, windowMin, lockMin);
      return json(false, null, "账号或密码错误", 401);
    }

    // success: clear throttle
    await clearFail(env as any, ip, u);

    const token = await signJwt({ sub: row.id, u: row.username, r: row.role }, env.JWT_SECRET, 7 * 24 * 3600);
    return json(true, {
      token,
      user: { id: row.id, username: row.username, role: row.role, must_change_password: row.must_change_password },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
