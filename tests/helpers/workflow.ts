export function extractCookieToken(setCookie: string | null) {
  if (!setCookie) return '';
  const m = setCookie.match(/inventory_cf_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export function bearerRequest(url: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  return new Request(url, { ...init, headers });
}

export function createWaitUntil() {
  const pending: Promise<any>[] = [];
  return {
    waitUntil(p: Promise<any>) { pending.push(Promise.resolve(p)); },
    async flush() { await Promise.allSettled(pending); },
  };
}
