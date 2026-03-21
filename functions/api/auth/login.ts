import { buildAuthCookie, json, signJwt, errorResponse, JWT_TTL_SECONDS } from "../../_auth";
import { verifyPassword } from "../../_password";
import { sqlNowStored, sqlStoredMinutesAgo, sqlStoredMinutesFromNow } from "../_time";
import { getUserPermissionMap, getUserTemplateCode } from "../../_permissions";
import { getUserDataScope } from '../services/data-scope';

function getClientIp(request: Request) {
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

function datetimeTextToMsBj(dt: string | null) {
  if (!dt) return null;
  const iso = dt.replace(" ", "T") + "+08:00";
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

async function getRecentFailCount(env: any, ip: string, username: string, windowMin: number) {
  try {
    const r = await env.DB.prepare(
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
    if (String(e?.message || "").includes("no such table")) return 0;
    throw e;
  }
}

async function verifyTurnstile(secret: string, token: string, ip?: string) {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const j: any = await r.json().catch(() => ({}));
  return !!j?.success;
}

function datetimeToMsBj(dt: string | null) {
  if (!dt) return null;
  const ms = datetimeTextToMsBj(dt);
  return Number.isFinite(ms) ? ms : null;
}
async function checkLocked(env: any, ip: string, username: string) {
  try {
    const r = await env.DB.prepare(
      `SELECT MAX(locked_until) AS locked_until
       FROM auth_login_throttle
       WHERE ip=?
         AND (username=? OR username='*')
         AND locked_until IS NOT NULL
         AND locked_until > ${sqlNowStored()}`
    )
      .bind(ip, username)
      .first<any>();

    const locked_until = r?.locked_until as string | null;
    return locked_until || null;
  } catch (e: any) {
    if (String(e?.message || "").includes("no such table")) return null;
    throw e;
  }
}

async function bumpFail(env: any, ip: string, username: string, maxFails: number, windowMin: number, lockMin: number, lockEnabled: boolean = true) {
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
    const { username, password, turnstile_token } = await request.json<any>();
    const u = (username || "").trim();
    const p = String(password || "");
    if (!u || !p) return json(false, null, "请输入账号和密码", 400);

    const ip = getClientIp(request);
    const maxFails = clampInt((env as any).AUTH_MAX_FAILS, 5, 3, 20);
    const windowMin = clampInt((env as any).AUTH_WINDOW_MIN, 15, 1, 120);
    const lockMin = clampInt((env as any).AUTH_LOCK_MIN, 15, 1, 240);

    const captchaAfter = clampInt((env as any).AUTH_CAPTCHA_AFTER, 3, 1, 50);
    const turnstileSecret = String((env as any).TURNSTILE_SECRET || "");

    const userFails = await getRecentFailCount(env as any, ip, u, windowMin);
    const ipFails = await getRecentFailCount(env as any, ip, "*", windowMin);
    const needCaptcha = !!turnstileSecret && Math.max(userFails, ipFails) >= captchaAfter;

    const lockedUntil = await checkLocked(env as any, ip, u);
    if (lockedUntil) {
      return json(false, { locked_until: lockedUntil, locked_until_ms: datetimeToMsBj(lockedUntil) }, `尝试次数过多，请稍后再试（锁定至 ${lockedUntil}）`, 429);
    }

    if (needCaptcha) {
      if (!turnstile_token) {
        return json(false, { require_captcha: true }, "请完成验证后再登录", 403);
      }
      const okCaptcha = await verifyTurnstile(turnstileSecret, String(turnstile_token), ip);
      if (!okCaptcha) {
        await bumpFail(env as any, ip, u, maxFails, windowMin, lockMin, true);
        await bumpFail(env as any, ip, "*", maxFails, windowMin, lockMin, true);
        return json(false, { require_captcha: true }, "验证码验证失败", 403);
      }
    }

    let row: any = null;
    try {
      row = await env.DB
        .prepare("SELECT id, username, password_hash, role, is_active, must_change_password, token_version FROM users WHERE username=?")
        .bind(u)
        .first<any>();
    } catch (e: any) {
      if (String(e?.message || "").includes("no such column") && String(e?.message || "").includes("token_version")) {
        row = await env.DB
          .prepare("SELECT id, username, password_hash, role, is_active, must_change_password FROM users WHERE username=?")
          .bind(u)
          .first<any>();
        if (row) row.token_version = 0;
      } else {
        throw e;
      }
    }

    if (!row || Number(row.is_active) !== 1) {
      await bumpFail(env as any, ip, u, maxFails, windowMin, lockMin, !needCaptcha);
      await bumpFail(env as any, ip, "*", maxFails, windowMin, lockMin, !needCaptcha);
      return json(false, null, "账号或密码错误", 401);
    }

    const ok = await verifyPassword(p, row.password_hash);
    if (!ok) {
      await bumpFail(env as any, ip, u, maxFails, windowMin, lockMin, !needCaptcha);
      await bumpFail(env as any, ip, "*", maxFails, windowMin, lockMin, !needCaptcha);
      return json(false, null, "账号或密码错误", 401);
    }

    await clearFail(env as any, ip, u);

    const token = await signJwt({ sub: row.id, u: row.username, r: row.role, tv: row.token_version || 0 }, env.JWT_SECRET, JWT_TTL_SECONDS);
    const permission_template_code = await getUserTemplateCode(env.DB, row.id, row.role).catch(() => null);
    const permissions = await getUserPermissionMap(env.DB, row.id, row.role, permission_template_code || undefined);
    const dataScope = await getUserDataScope(env.DB, row.id).catch(() => ({ data_scope_type: 'all', data_scope_value: null, data_scope_value2: null }));
    const res = json(true, {
      user: { id: row.id, username: row.username, role: row.role, must_change_password: row.must_change_password, permission_template_code, permissions, ...dataScope },
    });
    res.headers.append("Set-Cookie", buildAuthCookie(token));
    return res;
  } catch (e: any) {
    return errorResponse(e);
  }
};
