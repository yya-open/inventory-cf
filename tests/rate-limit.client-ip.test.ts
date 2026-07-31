import { describe, expect, it } from 'vitest';
import { getClientIp } from '../functions/api/services/rate-limit';

function requestWith(headers: Record<string, string>) {
  return new Request('https://example.com/api/auth/login', { method: 'POST', headers });
}

// Lockout and public throttle buckets are keyed on getClientIp, so a caller-controlled header must
// never influence the key: rotating it would otherwise hand an attacker unlimited fresh buckets.
describe('getClientIp only trusts the Cloudflare edge header', () => {
  it('returns CF-Connecting-IP when the edge sets it', () => {
    expect(getClientIp(requestWith({ 'CF-Connecting-IP': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('falls back to the unknown bucket instead of X-Forwarded-For', () => {
    expect(getClientIp(requestWith({ 'X-Forwarded-For': '198.51.100.7' }))).toBe('0.0.0.0');
    expect(getClientIp(requestWith({ 'x-forwarded-for': '198.51.100.7, 203.0.113.1' }))).toBe('0.0.0.0');
  });

  it('ignores X-Forwarded-For even when CF-Connecting-IP is present', () => {
    const ip = getClientIp(requestWith({ 'CF-Connecting-IP': '203.0.113.9', 'X-Forwarded-For': '198.51.100.7' }));
    expect(ip).toBe('203.0.113.9');
  });

  it('collapses rotated X-Forwarded-For values onto one bucket', () => {
    const keys = ['198.51.100.1', '198.51.100.2', '198.51.100.3'].map((spoofed) =>
      getClientIp(requestWith({ 'X-Forwarded-For': spoofed })),
    );
    expect(keys).toEqual(['0.0.0.0', '0.0.0.0', '0.0.0.0']);
  });

  it('returns the unknown bucket when no forwarding headers exist at all', () => {
    expect(getClientIp(requestWith({}))).toBe('0.0.0.0');
  });
});
