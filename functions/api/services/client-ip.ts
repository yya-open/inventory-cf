// Single source of truth for client-IP extraction.
// CF-Connecting-IP is the only client IP the Cloudflare edge sets and cannot be forged.
// X-Forwarded-For is caller-controlled and trivially spoofable, so it is never read here.

export function getClientIp(request: Request): string {
  // Rate-limit / throttle key: an absent edge header collapses to the shared '0.0.0.0'
  // bucket, so lockout/throttle can never be evaded by rotating client headers.
  return request.headers.get('CF-Connecting-IP') || '0.0.0.0';
}

export function getAuditClientIp(request: Request): string {
  // Provenance only: an unknown origin is recorded as '' rather than a real-looking
  // placeholder IP, so audit rows never imply an address we did not observe.
  return request.headers.get('CF-Connecting-IP') || '';
}
