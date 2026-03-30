import { buildAuthCookie, json, signJwt, errorResponse, getJwtTtlSeconds } from '../../_auth';
import { verifyPassword } from '../../_password';
import { getUserPermissionMap, getUserTemplateCode } from '../../_permissions';
import { getUserDataScope } from '../services/data-scope';
import {
  bumpAuthFail,
  clampInt,
  clearAuthFail,
  datetimeTextToMsBj,
  ensureAuthLoginThrottleTable,
  getAuthLockedUntil,
  getClientIp,
  getRecentAuthFailCount,
} from '../services/rate-limit';

async function verifyTurnstile(secret: string, token: string, ip?: string) {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
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

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const { username, password, turnstile_token } = await request.json<any>();
    const u = (username || '').trim();
    const p = String(password || '');
    if (!u || !p) return json(false, null, '请输入账号和密码', 400);

    await ensureAuthLoginThrottleTable(env.DB);

    const ip = getClientIp(request);
    const maxFails = clampInt((env as any).AUTH_MAX_FAILS, 5, 3, 20);
    const windowMin = clampInt((env as any).AUTH_WINDOW_MIN, 15, 1, 120);
    const lockMin = clampInt((env as any).AUTH_LOCK_MIN, 15, 1, 240);

    const captchaAfter = clampInt((env as any).AUTH_CAPTCHA_AFTER, 3, 1, 50);
    const turnstileSecret = String((env as any).TURNSTILE_SECRET || '');

    const userFails = await getRecentAuthFailCount(env.DB, ip, u, windowMin);
    const ipFails = await getRecentAuthFailCount(env.DB, ip, '*', windowMin);
    const needCaptcha = !!turnstileSecret && Math.max(userFails, ipFails) >= captchaAfter;

    const lockedUntil = await getAuthLockedUntil(env.DB, ip, u);
    if (lockedUntil) {
      return json(false, { locked_until: lockedUntil, locked_until_ms: datetimeToMsBj(lockedUntil) }, `尝试次数过多，请稍后再试（锁定至 ${lockedUntil}）`, 429);
    }

    if (needCaptcha) {
      if (!turnstile_token) {
        return json(false, { require_captcha: true }, '请完成验证后再登录', 403);
      }
      const okCaptcha = await verifyTurnstile(turnstileSecret, String(turnstile_token), ip);
      if (!okCaptcha) {
        await bumpAuthFail(env.DB, ip, u, maxFails, windowMin, lockMin, true);
        await bumpAuthFail(env.DB, ip, '*', maxFails, windowMin, lockMin, true);
        return json(false, { require_captcha: true }, '验证码验证失败', 403);
      }
    }

    let row: any = null;
    try {
      row = await env.DB
        .prepare('SELECT id, username, password_hash, role, is_active, must_change_password, token_version FROM users WHERE username=?')
        .bind(u)
        .first<any>();
    } catch (e: any) {
      if (String(e?.message || '').includes('no such column') && String(e?.message || '').includes('token_version')) {
        row = await env.DB
          .prepare('SELECT id, username, password_hash, role, is_active, must_change_password FROM users WHERE username=?')
          .bind(u)
          .first<any>();
        if (row) row.token_version = 0;
      } else {
        throw e;
      }
    }

    if (!row || Number(row.is_active) !== 1) {
      await bumpAuthFail(env.DB, ip, u, maxFails, windowMin, lockMin, !needCaptcha);
      await bumpAuthFail(env.DB, ip, '*', maxFails, windowMin, lockMin, !needCaptcha);
      return json(false, null, '账号或密码错误', 401);
    }

    const ok = await verifyPassword(p, row.password_hash);
    if (!ok) {
      await bumpAuthFail(env.DB, ip, u, maxFails, windowMin, lockMin, !needCaptcha);
      await bumpAuthFail(env.DB, ip, '*', maxFails, windowMin, lockMin, !needCaptcha);
      return json(false, null, '账号或密码错误', 401);
    }

    await clearAuthFail(env.DB, ip, u);

    const ttlSeconds = getJwtTtlSeconds(env as any);
    const token = await signJwt({ sub: row.id, u: row.username, r: row.role, tv: row.token_version || 0 }, env.JWT_SECRET, ttlSeconds);
    const permission_template_code = await getUserTemplateCode(env.DB, row.id, row.role).catch(() => null);
    const permissions = await getUserPermissionMap(env.DB, row.id, row.role, permission_template_code || undefined);
    const dataScope = await getUserDataScope(env.DB, row.id).catch(() => ({ data_scope_type: 'all', data_scope_value: null, data_scope_value2: null }));
    const res = json(true, {
      user: { id: row.id, username: row.username, role: row.role, must_change_password: row.must_change_password, permission_template_code, permissions, ...dataScope },
    });
    res.headers.append('Set-Cookie', buildAuthCookie(token, ttlSeconds));
    return res;
  } catch (e: any) {
    return errorResponse(e);
  }
};
