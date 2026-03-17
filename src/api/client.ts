import { useAuth } from "../store/auth";

type RequestOptions = { handleUnauthorized?: boolean; credentials?: RequestCredentials };
type ApiError = Error & { status?: number; response?: any };

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
async function parseJson(r: Response) { const t = await r.text(); try { return JSON.parse(t); } catch { return { ok: false, message: t || "请求失败" }; } }
function buildError(message: string, status: number, response: any): ApiError { const err = new Error(message) as ApiError; err.status = status; err.response = response; return err; }
export async function apiRequestJson<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}) {
  const { handleUnauthorized: shouldHandleUnauthorized = true, credentials = "include" } = options;
  const r = await fetch(path, { credentials, ...init, headers: { ...(init.headers || {}) } });
  const j = await parseJson(r);
  if (r.status === 401 && shouldHandleUnauthorized) return handleUnauthorized(j?.message);
  if (!r.ok || !j?.ok) throw buildError(j?.message || "请求失败", r.status, j);
  return j as T;
}
export const apiGet = <T>(path: string) => apiRequestJson<T>(path, { method: "GET" });
export const apiPost = <T>(path: string, body: any) => apiRequestJson<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const apiPut = <T>(path: string, body: any) => apiRequestJson<T>(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const apiDelete = <T>(path: string, body?: any) => apiRequestJson<T>(path, { method: "DELETE", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPostForm = <T>(path: string, form: FormData) => apiRequestJson<T>(path, { method: "POST", body: form });
export const apiGetPublic = <T>(path: string) => apiRequestJson<T>(path, { method: "GET" }, { handleUnauthorized: false });
export const apiPostPublic = <T>(path: string, body: any) => apiRequestJson<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, { handleUnauthorized: false });
function getDownloadFilename(path: string, r: Response, fallback?: string) { if (fallback) return fallback; const cd = r.headers.get("content-disposition") || ""; const utf8Match = cd.match(/filename\*=UTF-8''([^;]+)/i); if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]); const plainMatch = cd.match(/filename="?([^";]+)"?/i); if (plainMatch?.[1]) return plainMatch[1]; const pathname = new URL(path, window.location.origin).pathname; return pathname.split('/').filter(Boolean).pop() || 'download'; }
export async function apiDownload(path: string, filename?: string, options: RequestOptions = {}) { const { handleUnauthorized: shouldHandleUnauthorized = true, credentials = 'include' } = options; const r = await fetch(path, { method: 'GET', credentials }); if (r.status === 401 && shouldHandleUnauthorized) { const j = await parseJson(r); return handleUnauthorized(j?.message); } if (!r.ok) { const j = await parseJson(r); throw buildError(j?.message || '下载失败', r.status, j); } const blob = await r.blob(); const url = URL.createObjectURL(blob); try { const a = document.createElement('a'); a.href = url; a.download = getDownloadFilename(path, r, filename); document.body.appendChild(a); a.click(); a.remove(); } finally { URL.revokeObjectURL(url); } }
