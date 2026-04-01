import { useAuth } from "../store/auth";

type RequestOptions = { handleUnauthorized?: boolean; credentials?: RequestCredentials; cacheTtlMs?: number; skipCache?: boolean };
type ApiError = Error & { status?: number; response?: any };


type CachedGetEntry = { expiresAt: number; value?: any; pending?: Promise<any> };
const GET_CACHE_TTL_MS = 2_500;
const getResponseCache = new Map<string, CachedGetEntry>();

function buildRequestCacheKey(method: string, path: string, credentials: RequestCredentials) {
  return `${method.toUpperCase()}::${credentials}::${path}`;
}

function invalidateApiGetCache(prefixes?: string[]) {
  if (!prefixes?.length) {
    getResponseCache.clear();
    return;
  }
  for (const key of [...getResponseCache.keys()]) {
    if (prefixes.some((prefix) => key.includes(prefix))) getResponseCache.delete(key);
  }
}

function handleUnauthorized(message?: string): never {
  const auth = useAuth();
  auth.user = null as any;
  const path = window.location.pathname;
  if (path !== "/login") {
    const redirect = encodeURIComponent(path + window.location.search + window.location.hash);
    window.location.href = `/login?redirect=${redirect}`;
  }
  throw new Error(message || "登录已过期，请重新登录");
}

async function parseJson(r: Response) {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return { ok: false, message: t || "请求失败" };
  }
}

function buildError(message: string, status: number, response: any): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  err.response = response;
  return err;
}

export async function apiRequestJson<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}) {
  const { handleUnauthorized: shouldHandleUnauthorized = true, credentials = "include", cacheTtlMs = GET_CACHE_TTL_MS, skipCache = false } = options;
  const method = String(init.method || 'GET').toUpperCase();
  const headers = { ...(init.headers || {}) };
  const cacheKey = buildRequestCacheKey(method, path, credentials);
  const canCache = method === 'GET' && !skipCache && cacheTtlMs > 0;
  const now = Date.now();
  if (canCache) {
    const cached = getResponseCache.get(cacheKey);
    if (cached?.value && cached.expiresAt > now) return cached.value as T;
    if (cached?.pending) return cached.pending as Promise<T>;
  }
  const task = fetch(path, { credentials, ...init, headers }).then(async (r) => {
    const j = await parseJson(r);
    if (r.status === 401 && shouldHandleUnauthorized) return handleUnauthorized(j?.message);
    if (!r.ok || !j?.ok) throw buildError(j?.message || "请求失败", r.status, j);
    return j as T;
  });
  if (canCache) getResponseCache.set(cacheKey, { expiresAt: now + cacheTtlMs, pending: task });
  try {
    const result = await task;
    if (canCache) getResponseCache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, value: result });
    else if (method !== 'GET') invalidateApiGetCache();
    return result;
  } catch (error) {
    if (canCache) getResponseCache.delete(cacheKey);
    throw error;
  }
}

export const apiGet = <T>(path: string, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "GET", ...init });
export const apiPost = <T>(path: string, body: any, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "POST", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: JSON.stringify(body), ...init });
export const apiPut = <T>(path: string, body: any, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "PUT", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: JSON.stringify(body), ...init });
export const apiDelete = <T>(path: string, body?: any, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "DELETE", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: body === undefined ? undefined : JSON.stringify(body), ...init });
export const apiPostForm = <T>(path: string, form: FormData, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "POST", body: form, ...init });
export const apiGetPublic = <T>(path: string, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "GET", ...init }, { handleUnauthorized: false });
export const apiPostPublic = <T>(path: string, body: any, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "POST", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: JSON.stringify(body), ...init }, { handleUnauthorized: false });

function getDownloadFilename(path: string, r: Response, fallback?: string) {
  if (fallback) return fallback;
  const cd = r.headers.get("content-disposition") || "";
  const utf8Match = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const plainMatch = cd.match(/filename="?([^";]+)"?/i);
  if (plainMatch?.[1]) return plainMatch[1];
  const pathname = new URL(path, window.location.origin).pathname;
  return pathname.split('/').filter(Boolean).pop() || 'download';
}

export type ApiFetchedFile = {
  blob: Blob;
  filename: string;
  contentType: string;
};

export async function apiFetchFile(path: string, filename?: string, options: RequestOptions = {}, init: RequestInit = {}) {
  const { handleUnauthorized: shouldHandleUnauthorized = true, credentials = 'include' } = options;
  const r = await fetch(path, { method: 'GET', credentials, ...init });
  if (r.status === 401 && shouldHandleUnauthorized) {
    const j = await parseJson(r);
    return handleUnauthorized(j?.message);
  }
  if (!r.ok) {
    const j = await parseJson(r);
    throw buildError(j?.message || '下载失败', r.status, j);
  }
  return {
    blob: await r.blob(),
    filename: getDownloadFilename(path, r, filename),
    contentType: String(r.headers.get('content-type') || '').toLowerCase(),
  } satisfies ApiFetchedFile;
}

export function triggerFileDownload(file: ApiFetchedFile, filename?: string) {
  const url = URL.createObjectURL(file.blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || file.filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function apiDownload(path: string, filename?: string, options: RequestOptions = {}, init: RequestInit = {}) {
  const file = await apiFetchFile(path, filename, options, init);
  triggerFileDownload(file, filename || file.filename);
}
