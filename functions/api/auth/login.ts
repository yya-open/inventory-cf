import { buildAuthCookie, json, signJwt, getJwtTtlSeconds } from '../../_auth';
import { withErrorHandling } from '../_error';
import { verifyPassword } from '../../_password';
import { getUserPermissionMap, getUserTemplateCode } from '../../_permissions';
import { getUserDataScope } from '../services/data-scope';
import { invalidateCachedMe, primeCachedMe } from './me';
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

function readSiteverify(payload: unknown): { success: boolean; codes: string[] | null } {
  if (!payload || typeof payload !== 'object') return { success: false, codes: null };
  const success = 'success' in payload && payload.success === true;
  const raw = 'error-codes' in payload ? payload['error-codes'] : null;
  const codes = Array.isArray(raw) ? raw.filter((code: unknown): code is string => typeof code === 'string') : null;
  return { success, codes };
}

async function verifyTurnstile(secret: string, token: string, ip?: string) {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  const { success, codes } = readSiteverify(await r.json().catch(() => null));
  if (!success) {
    // `invalid-input-secret` here means TURNSTILE_SECRET itself is wrong/garbled; without this
    // log it is indistinguishable from a visitor simply failing the challenge. Never log the
    // secret or the visitor's response token.
    console.error('turnstile siteverify rejected', JSON.stringify({ status: r.status, codes }));
  }
  return success;
}

function datetimeToMsBj(dt: string | null) {
  if (!dt) return null;
  const ms = datetimeTextToMsBj(dt);
  return Number.isFinite(ms) ? ms : null;
}

// Fixed decoy credential for timing equalization on the account-not-found path. This is a real
// PBKDF2-SHA256 output at the same 100000 iterations `hashPassword` uses, derived from a random
// throwaway secret that was never recorded, so no live password can ever verify against it. It
// exists purely so the miss path performs the same key derivation as the hit path.
const DUMMY_PASSWORD_HASH = 'pbkdf2$100000$DTL6yy-pF5-zlK7KpuIlvg$zdevqb6j0_S-fiqSkELk4YRnFxUIkauwqUW2GWnl5Po';

export const onRequestPost = withErrorHandling<{ DB: D1Database; JWT_SECRET: string }>(async ({ env, request }) => {
  const { username, password, turnstile_token } = await request.json();
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
        await bumpAuthFail(env.DB, ip, u, maxFails, windowMin, lockMin);
        await bumpAuthFail(env.DB, ip, '*', maxFails, windowMin, lockMin);
        return json(false, { require_captcha: true }, '验证码验证失败', 403);
      }
    }

    let row: any = null;
    try {
      row = await env.DB
        .prepare('SELECT id, username, password_hash, role, is_active, must_change_password, token_version, acl_version FROM users WHERE username=?')
        .bind(u)
        .first<any>();
    } catch (e: any) {
      if (String(e?.message || '').includes('no such column') && String(e?.message || '').includes('token_version')) {
        row = await env.DB
          .prepare('SELECT id, username, password_hash, role, is_active, must_change_password, acl_version FROM users WHERE username=?')
          .bind(u)
          .first<any>();
        if (row) {
          row.token_version = 0;
          row.acl_version = Number(row.acl_version || 0);
        }
      } else {
        throw e;
      }
    }

    if (!row || Number(row.is_active) !== 1) {
      // Timing equalization (CWE-208): the branch below always pays a full 100000-iteration PBKDF2
      // verify, even when the password is wrong. Skipping that work here made a missing or
      // deactivated account answer measurably faster, which let an unauthenticated caller
      // enumerate valid usernames well before the lockout or captcha thresholds engaged. Spend the
      // identical cost against the fixed decoy hash; the result is discarded by design.
      await verifyPassword(p, DUMMY_PASSWORD_HASH);
      await bumpAuthFail(env.DB, ip, u, maxFails, windowMin, lockMin);
      await bumpAuthFail(env.DB, ip, '*', maxFails, windowMin, lockMin);
      return json(false, null, '账号或密码错误', 401);
    }

    const ok = await verifyPassword(p, row.password_hash);
    if (!ok) {
      await bumpAuthFail(env.DB, ip, u, maxFails, windowMin, lockMin);
      await bumpAuthFail(env.DB, ip, '*', maxFails, windowMin, lockMin);
      return json(false, null, '账号或密码错误', 401);
    }

    await clearAuthFail(env.DB, ip, u);

    await invalidateCachedMe(env.DB, Number(row.id), 'auth_login', (env as any).__timing);

    const ttlSeconds = getJwtTtlSeconds(env as any);
    const token = await signJwt({ sub: row.id, u: row.username, r: row.role, tv: row.token_version || 0 }, env.JWT_SECRET, ttlSeconds);
    const permission_template_code = await getUserTemplateCode(env.DB, row.id, row.role).catch(() => null);
    const permissions = await getUserPermissionMap(env.DB, row.id, row.role, permission_template_code || undefined);
    const dataScope = await getUserDataScope(env.DB, row.id);
    const mePayload = {
      user: { id: row.id, username: row.username, role: row.role, must_change_password: row.must_change_password, acl_version: Number((row as any)?.acl_version || 0), permission_template_code, permissions, ...dataScope },
    };
    primeCachedMe(env.DB, row.id, mePayload, Number((row as any)?.acl_version || 0));
    const res = json(true, {
      user: { id: row.id, username: row.username, role: row.role, must_change_password: row.must_change_password, permission_template_code, permissions, ...dataScope },
    });
    res.headers.append('Set-Cookie', buildAuthCookie(token, ttlSeconds));
    return res;
});
