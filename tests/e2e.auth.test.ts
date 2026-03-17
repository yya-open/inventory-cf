import { describe, expect, it } from 'vitest';
import { hashPassword } from '../functions/_password';
import { onRequestPost as loginPost } from '../functions/api/auth/login';
import { onRequestPost as changePasswordPost } from '../functions/api/auth/change-password';
import { onRequestGet as meGet } from '../functions/api/auth/me';
import { createFakeEnv } from './helpers/fakeD1';
import { bearerRequest, extractCookieToken } from './helpers/workflow';

async function jsonOf(res: Response) { return await res.json() as any; }

describe('e2e auth workflow', () => {
  it('logs in, rotates token on password change, and rejects old token', async () => {
    const { env, DB } = createFakeEnv();
    DB.state.users.push({ id: 1, username: 'admin', password_hash: await hashPassword('admin123'), role: 'admin', is_active: 1, must_change_password: 1, token_version: 0 });

    const loginRes = await loginPost({ env, request: new Request('https://example.com/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '1.1.1.1' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) }) } as any);
    const loginBody = await jsonOf(loginRes);
    expect(loginRes.status).toBe(200);
    expect(loginBody.ok).toBe(true);

    const oldToken = extractCookieToken(loginRes.headers.get('set-cookie'));
    expect(oldToken).toBeTruthy();

    const changeRes = await changePasswordPost({ env, request: bearerRequest('https://example.com/api/auth/change-password', oldToken, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ old_password: 'admin123', new_password: 'newpass123' }) }) } as any);
    const changeBody = await jsonOf(changeRes);
    expect(changeRes.status).toBe(200);
    expect(changeBody.ok).toBe(true);

    const refreshedToken = String((env as any).__refresh_token || '');
    expect(refreshedToken).toBeTruthy();
    expect(DB.state.users[0].token_version).toBe(1);

    const oldMeRes = await meGet({ env, request: bearerRequest('https://example.com/api/auth/me', oldToken) } as any);
    const oldMeBody = await jsonOf(oldMeRes);
    expect(oldMeRes.status).toBe(401);
    expect(oldMeBody.message).toContain('登录已失效');

    const newMeRes = await meGet({ env, request: bearerRequest('https://example.com/api/auth/me', refreshedToken) } as any);
    const newMeBody = await jsonOf(newMeRes);
    expect(newMeRes.status).toBe(200);
    expect(newMeBody.data.user.username).toBe('admin');

    const reloginOldRes = await loginPost({ env, request: new Request('https://example.com/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '1.1.1.1' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) }) } as any);
    expect(reloginOldRes.status).toBe(401);

    const reloginNewRes = await loginPost({ env, request: new Request('https://example.com/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '1.1.1.1' }, body: JSON.stringify({ username: 'admin', password: 'newpass123' }) }) } as any);
    expect(reloginNewRes.status).toBe(200);
  });
});
