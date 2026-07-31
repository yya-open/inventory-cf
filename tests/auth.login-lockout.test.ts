import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as RateLimitModule from '../functions/api/services/rate-limit';
import { sqlStoredMinutesFromNow } from '../functions/api/_time';

// The factory is hoisted above the static imports, so the shared spies have to be hoisted too.
const throttle = vi.hoisted(() => ({
  bumpAuthFail: vi.fn(async () => {}),
  clearAuthFail: vi.fn(async () => {}),
  recentFails: 0,
}));

vi.mock('../functions/api/services/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof RateLimitModule>()),
  ensureAuthLoginThrottleTable: vi.fn(async () => {}),
  getRecentAuthFailCount: vi.fn(async () => throttle.recentFails),
  getAuthLockedUntil: vi.fn(async () => null),
  bumpAuthFail: throttle.bumpAuthFail,
  clearAuthFail: throttle.clearAuthFail,
}));

import { onRequestPost as loginHandler } from '../functions/api/auth/login';

type TestEnv = {
  DB: { prepare: (sql: string) => { bind: (value: string) => { first: () => Promise<null> } } };
  JWT_SECRET: string;
  TURNSTILE_SECRET: string;
  AUTH_CAPTCHA_AFTER: string;
  AUTH_MAX_FAILS: string;
  AUTH_LOCK_MIN: string;
};

// Pages hands the handler a full EventContext; it only reads `env` and `request`, and the fake DB
// answers the single users lookup empty so every request lands on the wrong-password branch.
const invokeLogin = loginHandler as unknown as (context: { env: TestEnv; request: Request }) => Promise<Response>;

const env: TestEnv = {
  DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
  JWT_SECRET: 'test-jwt-secret',
  TURNSTILE_SECRET: 'test-turnstile-secret',
  AUTH_CAPTCHA_AFTER: '3',
  AUTH_MAX_FAILS: '10',
  AUTH_LOCK_MIN: '10',
};

async function postLogin(body: Record<string, unknown>) {
  const request = new Request('https://example.com/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify({ username: 'probe-user', password: 'wrong-pass', ...body }),
  });
  const response = await invokeLogin({ env, request });
  return response.status;
}

describe('login fail counting stays armed once the captcha gate opens', () => {
  beforeEach(() => {
    throttle.bumpAuthFail.mockClear();
    throttle.clearAuthFail.mockClear();
    throttle.recentFails = 0;
    vi.unstubAllGlobals();
  });

  it('records a wrong password against both buckets before the gate is armed', async () => {
    expect(await postLogin({})).toBe(401);

    expect(throttle.bumpAuthFail.mock.calls).toEqual([
      [env.DB, '203.0.113.9', 'probe-user', 10, 15, 10],
      [env.DB, '203.0.113.9', '*', 10, 15, 10],
    ]);
  });

  it('records a wrong password identically while the captcha gate is armed', async () => {
    // 4th attempt in the window: the gate is armed and the visitor solved it.
    throttle.recentFails = 3;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ success: true, 'error-codes': [] })),
    );

    expect(await postLogin({ turnstile_token: 'solved-token' })).toBe(401);

    // Regression: the lock used to be disarmed (`!needCaptcha`) exactly on these attempts, which
    // let password guessing continue past AUTH_MAX_FAILS forever.
    expect(throttle.bumpAuthFail.mock.calls).toEqual([
      [env.DB, '203.0.113.9', 'probe-user', 10, 15, 10],
      [env.DB, '203.0.113.9', '*', 10, 15, 10],
    ]);
    for (const call of throttle.bumpAuthFail.mock.calls) {
      expect((call as unknown[]).length).toBe(6);
    }
  });

  it('counts a failed captcha the same way', async () => {
    throttle.recentFails = 3;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ success: false, 'error-codes': ['invalid-input-response'] })),
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await postLogin({ turnstile_token: 'stale-token' })).toBe(403);

    expect(throttle.bumpAuthFail.mock.calls.length).toBe(2);
    for (const call of throttle.bumpAuthFail.mock.calls) {
      expect((call as unknown[]).length).toBe(6);
    }
    errorSpy.mockRestore();
  });
});

describe('bumpAuthFail lock arithmetic', () => {
  async function capture(maxFails: number, windowMin: number, lockMin: number) {
    const real = await vi.importActual<typeof RateLimitModule>('../functions/api/services/rate-limit');
    let sql = '';
    const db = {
      prepare(statement: string) {
        sql = statement;
        return { bind: () => ({ run: async () => ({}) }) };
      },
    } as unknown as D1Database;
    await real.bumpAuthFail(db, '203.0.113.9', 'probe-user', maxFails, windowMin, lockMin);
    const conflict = sql.slice(sql.indexOf('DO UPDATE SET'));
    return { sql, conflict };
  }

  it('locks on the attempt that reaches maxFails', async () => {
    const { sql, conflict } = await capture(4, 15, 7);

    expect(conflict).toContain(') >= 4');
    expect(conflict).toContain(`THEN ${sqlStoredMinutesFromNow(7)}`);
    // A first-ever failure only locks when one strike is already the limit.
    expect(sql).toContain('CASE WHEN 1 >= 4 THEN');
  });

  it('never clears a lock that is already on the row', async () => {
    const { conflict } = await capture(4, 15, 7);

    expect(conflict).toMatch(/locked_until = CASE[\s\S]*ELSE auth_login_throttle\.locked_until\s*END/);
    expect(conflict).not.toContain('ELSE NULL');
  });

  it('carries no build-time switch that can disarm the lock', async () => {
    const { sql } = await capture(4, 15, 7);

    // The old signature interpolated `${lockEnabled ? 1 : 0}=1` into both lock branches.
    expect(sql).not.toMatch(/\b[01]\s*=\s*[01]\b/);
  });
});
