import { json, signJwt, errorResponse, JWT_TTL_SECONDS } from "../../_auth";
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

async function getFailCount(env: any, ip: string, username: string, windowMin: number) {
  try {
    const r = await env.DB.prepare(
      `SELECT MAX(fail_count) AS c
       FROM auth_login_throttle
       WHERE ip=?
         AND (username=? OR username='*')
         AND (
           last_fail_at IS NULL
           OR last_fail_at >= datetime('now', '-${windowMin} minutes')
         )`
    )
      .bind(ip, username)
      .first<any>();
    const c = Number(r?.c ?? 0);
    return Number.isFinite(c) ? c : 0;
  } catch (e: any) {
    if (String(e?.message || "").includes("no such table")) return 0;
    throw e;
  }
}

async function verifyTurnstile(secret: string, token: string, ip?: string) {
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);

  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const j: any = await r.json().catch(() => ({}));
  return Boolean(j?.success);
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const { username, password, turnstile_token } = await request.json<any>();
    const u = (username || "").trim();
    // Keep password normalization consistent with set/reset/change password logic.
    const p = String(password || "").trim();
    if (!u || !p) return json(false, null, "请输入账号和密码", 400);

    const ip = getClientIp(request);

    // 可选配置（Pages 环境变量）：AUTH_MAX_FAILS / AUTH_WINDOW_MIN / AUTH_LOCK_MIN
    const maxFails = clampInt((env as any).AUTH_MAX_FAILS, 5, 3, 20);
    const windowMin = clampInt((env as any).AUTH_WINDOW_MIN, 15, 1, 120);
    const lockMin = clampInt((env as any).AUTH_LOCK_MIN, 15, 1, 240);

    const lockedUntil = await checkLocked(env as any, ip, u);
    if (lockedUntil) {
      // D1 datetime('now') returns UTC formatted as 'YYYY-MM-DD HH:MM:SS'.
      // Return an unambiguous time (ISO + ms) so the frontend can render in local time.
      const lockedUntilIso = `${lockedUntil}`.includes("T")
        ? String(lockedUntil)
        : String(lockedUntil).replace(" ", "T") + "Z";
      const lockedUntilMs = Date.parse(lockedUntilIso);
      return json(
        false,
        {
          locked_until: lockedUntilIso,
          locked_until_ms: Number.isFinite(lockedUntilMs) ? lockedUntilMs : null,
        },
        "尝试次数过多，请稍后再试",
        429
      );
    }

    // 可选：失败次数达到阈值后启用 Turnstile 验证
    const turnstileSecret = String((env as any).TURNSTILE_SECRET || "");
    const captchaAfter = clampInt((env as any).AUTH_CAPTCHA_AFTER, 3, 2, 10);
    if (turnstileSecret) {
      const failCount = await getFailCount(env as any, ip, u, windowMin);
      if (failCount >= captchaAfter) {
        if (!turnstile_token) {
          return json(false, { require_captcha: true }, "请完成验证后再登录", 403);
        }
        const okCaptcha = await verifyTurnstile(turnstileSecret, String(turnstile_token), ip);
        if (!okCaptcha) {
          return json(false, { require_captcha: true }, "验证失败，请重试", 403);
        }
      }
    }

    let row: any = null;
    try {
      row = await env.DB
        .prepare("SELECT id, username, password_hash, role, is_active, must_change_password, token_version FROM users WHERE username=?")
        .bind(u)
        .first<any>();
    } catch (e: any) {
      // Backward compatible: older DB may not have token_version column yet.
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

    const token = await signJwt({ sub: row.id, u: row.username, r: row.role, tv: (row.token_version||0) }, env.JWT_SECRET, JWT_TTL_SECONDS);
    return json(true, {
      token,
      user: { id: row.id, username: row.username, role: row.role, must_change_password: row.must_change_password },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
