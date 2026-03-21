import { useAuth } from "../store/auth";
function handleUnauthorized(message) {
    const auth = useAuth();
    auth.user = null;
    const path = window.location.pathname;
    if (path !== "/login") {
        const redirect = encodeURIComponent(path + window.location.search + window.location.hash);
        window.location.href = `/login?redirect=${redirect}`;
    }
    throw new Error(message || "登录已过期，请重新登录");
}
async function parseJson(r) {
    const t = await r.text();
    try {
        return JSON.parse(t);
    }
    catch {
        return { ok: false, message: t || "请求失败" };
    }
}
function buildError(message, status, response) {
    const err = new Error(message);
    err.status = status;
    err.response = response;
    return err;
}
export async function apiRequestJson(path, init = {}, options = {}) {
    const { handleUnauthorized: shouldHandleUnauthorized = true, credentials = "include" } = options;
    const r = await fetch(path, { credentials, ...init, headers: { ...(init.headers || {}) } });
    const j = await parseJson(r);
    if (r.status === 401 && shouldHandleUnauthorized)
        return handleUnauthorized(j?.message);
    if (!r.ok || !j?.ok)
        throw buildError(j?.message || "请求失败", r.status, j);
    return j;
}
export const apiGet = (path, init = {}) => apiRequestJson(path, { method: "GET", ...init });
export const apiPost = (path, body, init = {}) => apiRequestJson(path, { method: "POST", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: JSON.stringify(body), ...init });
export const apiPut = (path, body, init = {}) => apiRequestJson(path, { method: "PUT", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: JSON.stringify(body), ...init });
export const apiDelete = (path, body, init = {}) => apiRequestJson(path, { method: "DELETE", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: body === undefined ? undefined : JSON.stringify(body), ...init });
export const apiPostForm = (path, form, init = {}) => apiRequestJson(path, { method: "POST", body: form, ...init });
export const apiGetPublic = (path, init = {}) => apiRequestJson(path, { method: "GET", ...init }, { handleUnauthorized: false });
export const apiPostPublic = (path, body, init = {}) => apiRequestJson(path, { method: "POST", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: JSON.stringify(body), ...init }, { handleUnauthorized: false });
function getDownloadFilename(path, r, fallback) {
    if (fallback)
        return fallback;
    const cd = r.headers.get("content-disposition") || "";
    const utf8Match = cd.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1])
        return decodeURIComponent(utf8Match[1]);
    const plainMatch = cd.match(/filename="?([^";]+)"?/i);
    if (plainMatch?.[1])
        return plainMatch[1];
    const pathname = new URL(path, window.location.origin).pathname;
    return pathname.split('/').filter(Boolean).pop() || 'download';
}
export async function apiDownload(path, filename, options = {}, init = {}) {
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
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = getDownloadFilename(path, r, filename);
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
