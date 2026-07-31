import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as RateLimitModule from '../functions/api/services/rate-limit';

// Throttle counters are faked so the captcha gate is always armed: these tests pin the siteverify
// branch of /api/auth/login, not the fail-counting.
vi.mock('../functions/api/services/rate-limit', async (importOriginal) => ({
  // Mock factories are hoisted above static imports, so the real module can only be reached here.
  ...(await importOriginal<typeof RateLimitModule>()),
  ensureAuthLoginThrottleTable: vi.fn(async () => {}),
  getRecentAuthFailCount: vi.fn(async () => 9),
  getAuthLockedUntil: vi.fn(async () => null),
  bumpAuthFail: vi.fn(async () => {}),
  clearAuthFail: vi.fn(async () => {}),
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

type LoginInvoke = (context: { env: TestEnv; request: Request }) => Promise<Response>;

// Pages hands the handler a full EventContext; it only reads `env` and `request`, and the fake DB
// only answers the single users lookup, so the narrower shape is supplied deliberately.
const invokeLogin = loginHandler as unknown as LoginInvoke;

const env: TestEnv = {
  DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
  JWT_SECRET: 'test-jwt-secret',
  TURNSTILE_SECRET: 'test-turnstile-secret',
  AUTH_CAPTCHA_AFTER: '3',
  AUTH_MAX_FAILS: '10',
  AUTH_LOCK_MIN: '10',
};

const CLIENT_TOKEN = 'client-response-token';

function stubSiteverify(payload: unknown, status = 200) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'application/json' } })),
  );
}

async function postLogin() {
  const request = new Request('https://example.com/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'probe-user', password: 'probe-pass', turnstile_token: CLIENT_TOKEN }),
  });
  const response = await invokeLogin({ env, request });
  return { status: response.status, body: (await response.json()) as { ok: boolean; message?: string } };
}

function turnstileLogs(spy: MockInstance<typeof console.error>) {
  return spy.mock.calls.filter((call) => call[0] === 'turnstile siteverify rejected').map((call) => String(call[1]));
}

describe('login turnstile diagnostics', () => {
  let errorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
  });

  it('logs invalid-input-secret so a broken TURNSTILE_SECRET is diagnosable', async () => {
    stubSiteverify({ success: false, 'error-codes': ['invalid-input-secret'] });

    const { status, body } = await postLogin();

    expect(status).toBe(403);
    expect(body.message).toBe('验证码验证失败');
    expect(turnstileLogs(errorSpy)).toEqual([expect.stringContaining('invalid-input-secret')]);
  });

  it('distinguishes a visitor failing the challenge from a broken secret', async () => {
    stubSiteverify({ success: false, 'error-codes': ['invalid-input-response'] });

    const { status } = await postLogin();

    expect(status).toBe(403);
    const logged = turnstileLogs(errorSpy);
    expect(logged).toEqual([expect.stringContaining('invalid-input-response')]);
    expect(logged[0]).not.toContain('invalid-input-secret');
  });

  it('never logs the secret or the visitor response token', async () => {
    stubSiteverify({ success: false, 'error-codes': ['invalid-input-secret'] });

    await postLogin();

    const logged = turnstileLogs(errorSpy).join('|');
    expect(logged).not.toContain(env.TURNSTILE_SECRET);
    expect(logged).not.toContain(CLIENT_TOKEN);
  });

  it('stays quiet and passes the gate when siteverify succeeds', async () => {
    stubSiteverify({ success: true, 'error-codes': [] });

    const { status, body } = await postLogin();

    // Captcha accepted, so the request reaches the users lookup, which the fake DB answers empty.
    expect(status).toBe(401);
    expect(body.message).toBe('账号或密码错误');
    expect(turnstileLogs(errorSpy)).toEqual([]);
  });

  it('reports a null code list when siteverify returns a non-JSON body', async () => {
    stubSiteverify('<html>upstream down</html>', 502);

    const { status } = await postLogin();

    expect(status).toBe(403);
    expect(turnstileLogs(errorSpy)).toEqual([expect.stringContaining('"codes":null')]);
  });
});
