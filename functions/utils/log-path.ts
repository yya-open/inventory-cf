const SENSITIVE_QUERY_KEYS: Record<string, true> = {
  token: true,
  key: true,
  qr_key: true,
  secret: true,
  password: true,
  access_token: true,
  authorization: true,
};

export const REDACTED_QUERY_VALUE = '***';

/**
 * Request path for ops logs (slow_request_log / request_error_log).
 * QR routes carry credentials in the query string (`token`, `key`), and those
 * logs are rendered to any ops_tools holder, so credentials are masked here.
 */
export function buildLogPath(url: URL) {
  const search = url.search;
  if (search.length < 2) return url.pathname;
  const params = new URLSearchParams(search);
  let redacted = false;
  for (const key of Array.from(params.keys())) {
    if (!SENSITIVE_QUERY_KEYS[key.trim().toLowerCase()]) continue;
    params.set(key, REDACTED_QUERY_VALUE);
    redacted = true;
  }
  if (!redacted) return url.pathname + search;
  return `${url.pathname}?${params.toString()}`;
}
