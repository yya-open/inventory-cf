import { getAuthRequestEpoch, getAuthSessionKey, useAuth } from "../store/auth";
import { ElMessage } from '../utils/el-services';

import type { Schema } from './schema';

type RequestOptions = { handleUnauthorized?: boolean; credentials?: RequestCredentials };
type ApiError = Error & { status?: number; response?: any; error_code?: string };
export type ApiEnvelope<T> = { ok: boolean; data?: T; message?: string; error_code?: string; meta?: Record<string, unknown> };
export type ApiErrorCode =
  | 'SCOPE_DEPARTMENT_DENIED'
  | 'SCOPE_WAREHOUSE_DENIED'
  | 'SCOPE_PARTS_WAREHOUSE_DENIED'
  | 'INVALID_PARAMS'
  | 'STOCK_IN_FAILED'
  | 'INSUFFICIENT_STOCK'
  | 'WRITE_CONFLICT'
  | 'MISSING_STOCKTAKE_ID'
  | 'STOCKTAKE_NOT_FOUND'
  | 'STOCKTAKE_ALREADY_APPLIED'
  | 'STOCKTAKE_INVALID_STATUS'
  | 'STOCKTAKE_STATUS_CHANGED'
  | 'STOCKTAKE_APPLY_NOT_FINALIZED'
  | 'STOCKTAKE_NOT_DRAFT'
  | 'STOCKTAKE_NOT_APPLIED'
  | 'EMPTY_IMPORT_LINES'
  | 'EMPTY_SKU'
  | 'USER_USERNAME_REQUIRED'
  | 'USER_PASSWORD_POLICY_INVALID'
  | 'USER_ROLE_INVALID'
  | 'USERNAME_ALREADY_EXISTS'
  | 'USER_ID_INVALID'
  | 'USER_NOT_FOUND'
  | 'USER_SELF_DISABLE_FORBIDDEN'
  | 'USER_LAST_ADMIN_REQUIRED'
  | 'USER_SELF_DELETE_FORBIDDEN'
  | 'RESTORE_MULTIPART_REQUIRED'
  | 'RESTORE_CONFIRM_INVALID'
  | 'RESTORE_FILE_MISSING'
  | 'BACKUP_BUCKET_NOT_BOUND'
  | 'RESTORE_JOB_ID_REQUIRED'
  | 'RESTORE_JOB_NOT_FOUND'
  | 'RESTORE_SNAPSHOT_FAILED'
  | 'RESTORE_R2_FILE_MISSING'
  | 'BACKUP_VALIDATE_FAILED'
  | 'RESTORE_RUN_FAILED';

const API_ERROR_MESSAGE_MAP: Record<string, string> = {
  SCOPE_DEPARTMENT_DENIED: '当前账号的数据范围不包含该部门，请联系管理员调整权限范围。',
  SCOPE_WAREHOUSE_DENIED: '当前账号的数据范围不包含该仓库，请联系管理员调整权限范围。',
  SCOPE_PARTS_WAREHOUSE_DENIED: '当前账号未授权访问该配件仓，请联系管理员调整权限范围。',
  USER_LAST_ADMIN_REQUIRED: '系统至少需要保留一个启用的管理员账号。',
  USER_SELF_DISABLE_FORBIDDEN: '不能禁用当前登录账号。',
  USER_SELF_DELETE_FORBIDDEN: '不能删除当前登录账号。',
  USER_ROLE_INVALID: '角色无效，请刷新页面后重试。',
  USER_NOT_FOUND: '目标用户不存在，可能已被删除。',
  BACKUP_BUCKET_NOT_BOUND: '系统未绑定备份存储桶，请联系管理员检查部署配置。',
  RESTORE_CONFIRM_INVALID: '恢复任务二次确认未通过，请按提示输入确认文本。',
  BACKUP_VALIDATE_FAILED: '备份文件校验失败，请检查版本和完整性后重试。',
  WRITE_CONFLICT: '检测到并发写入冲突，请刷新数据后重试。',
};

function handleUnauthorized(message: string | undefined, requestEpoch?: number, sessionKey?: string): never {
  if ((typeof requestEpoch === "number" && requestEpoch !== getAuthRequestEpoch()) || (typeof sessionKey === 'string' && sessionKey && sessionKey !== getAuthSessionKey())) {
    throw new Error(message || "请求已过期");
  }
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

function buildError(message: string, status: number, response: any, errorCode?: string): ApiError {
  const mapped = errorCode ? API_ERROR_MESSAGE_MAP[errorCode] : '';
  const err = new Error(mapped || message) as ApiError;
  err.status = status;
  err.response = response;
  if (errorCode) err.error_code = errorCode;
  return err;
}

export async function apiRequestJson<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}) {
  const { handleUnauthorized: shouldHandleUnauthorized = true, credentials = "include" } = options;
  const requestEpoch = getAuthRequestEpoch();
  const sessionKey = getAuthSessionKey();
  const r = await fetch(path, { credentials, ...init, headers: { ...(init.headers || {}), 'x-auth-session-key': sessionKey } });
  const j = await parseJson(r);
  if (r.status === 401 && shouldHandleUnauthorized) return handleUnauthorized(j?.message, requestEpoch, sessionKey);
  if (!r.ok || !j?.ok) throw buildError(j?.message || "请求失败", r.status, j, j?.error_code);
  return j as T;
}

export async function apiRequestJsonWithMeta<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}) {
  const { handleUnauthorized: shouldHandleUnauthorized = true, credentials = "include" } = options;
  const requestEpoch = getAuthRequestEpoch();
  const sessionKey = getAuthSessionKey();
  const startedAt = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
  const r = await fetch(path, { credentials, ...init, headers: { ...(init.headers || {}), 'x-auth-session-key': sessionKey } });
  const endedAt = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
  const j = await parseJson(r);
  if (r.status === 401 && shouldHandleUnauthorized) return handleUnauthorized(j?.message, requestEpoch, sessionKey);
  if (!r.ok || !j?.ok) throw buildError(j?.message || "请求失败", r.status, j, j?.error_code);
  return {
    payload: j as T,
    timing: {
      durationMs: Math.max(0, endedAt - startedAt),
      serverTiming: String(r.headers.get('server-timing') || '').trim(),
    },
  };
}

export const apiGet = <T>(path: string, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "GET", ...init });
export const apiPost = <T>(path: string, body: any, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "POST", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: JSON.stringify(body), ...init });
export const apiPut = <T>(path: string, body: any, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "PUT", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: JSON.stringify(body), ...init });
export const apiDelete = <T>(path: string, body?: any, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "DELETE", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: body === undefined ? undefined : JSON.stringify(body), ...init });
export const apiPostForm = <T>(path: string, form: FormData, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "POST", body: form, ...init });
export const apiGetPublic = <T>(path: string, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "GET", ...init }, { handleUnauthorized: false });
export const apiPostPublic = <T>(path: string, body: any, init: RequestInit = {}) => apiRequestJson<T>(path, { method: "POST", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: JSON.stringify(body), ...init }, { handleUnauthorized: false });
export const apiGetPublicWithMeta = <T>(path: string, init: RequestInit = {}) => apiRequestJsonWithMeta<T>(path, { method: "GET", ...init }, { handleUnauthorized: false });
export const apiPostPublicWithMeta = <T>(path: string, body: any, init: RequestInit = {}) => apiRequestJsonWithMeta<T>(path, { method: "POST", headers: { "content-type": "application/json", ...(init.headers || {}) }, body: JSON.stringify(body), ...init }, { handleUnauthorized: false });


function unwrapData<T>(payload: ApiEnvelope<T>, schema?: Schema<T>) {
  const data = payload?.data as T;
  return schema ? schema(data) : data;
}

export async function apiGetData<T>(path: string, schema?: Schema<T>, init: RequestInit = {}) {
  const payload = await apiGet<ApiEnvelope<T>>(path, init);
  return unwrapData(payload, schema);
}

export async function apiPostData<T>(path: string, body: any, schema?: Schema<T>, init: RequestInit = {}) {
  const payload = await apiPost<ApiEnvelope<T>>(path, body, init);
  return unwrapData(payload, schema);
}

export async function apiPutData<T>(path: string, body: any, schema?: Schema<T>, init: RequestInit = {}) {
  const payload = await apiPut<ApiEnvelope<T>>(path, body, init);
  return unwrapData(payload, schema);
}

export async function apiDeleteData<T>(path: string, body?: any, schema?: Schema<T>, init: RequestInit = {}) {
  const payload = await apiDelete<ApiEnvelope<T>>(path, body, init);
  return unwrapData(payload, schema);
}

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
  const requestEpoch = getAuthRequestEpoch();
  const sessionKey = getAuthSessionKey();
  const r = await fetch(path, { method: 'GET', credentials, ...init, headers: { ...(init.headers || {}), 'x-auth-session-key': sessionKey } });
  if (r.status === 401 && shouldHandleUnauthorized) {
    const j = await parseJson(r);
    return handleUnauthorized(j?.message, requestEpoch, sessionKey);
  }
  if (!r.ok) {
    const j = await parseJson(r);
    throw buildError(j?.message || '下载失败', r.status, j, j?.error_code);
  }
  return {
    blob: await r.blob(),
    filename: getDownloadFilename(path, r, filename),
    contentType: String(r.headers.get('content-type') || '').toLowerCase(),
  } satisfies ApiFetchedFile;
}

export function triggerFileDownload(file: ApiFetchedFile, filename?: string) {
  const url = URL.createObjectURL(file.blob);
  const downloadName = filename || file.filename || 'download';
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    ElMessage.success(`已开始下载：${downloadName}`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function apiDownload(path: string, filename?: string, options: RequestOptions = {}, init: RequestInit = {}) {
  const file = await apiFetchFile(path, filename, options, init);
  triggerFileDownload(file, filename || file.filename);
}

export function isApiErrorCode(error: unknown, code: ApiErrorCode) {
  return String((error as any)?.error_code || '').trim() === code;
}
