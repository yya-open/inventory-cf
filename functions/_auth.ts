import { clampSeconds } from './utils/numeric';

type Role = "admin" | "operator" | "viewer";

export const JWT_TTL_SECONDS = 24 * 3600;
export const REFRESH_THRESHOLD_SECONDS = 12 * 3600;

export function getJwtTtlSeconds(env?: { JWT_TTL_SECONDS?: string | number | null }) {
  return clampSeconds(env?.JWT_TTL_SECONDS, JWT_TTL_SECONDS, 15 * 60, 30 * 24 * 3600);
}

export function getJwtRefreshThresholdSeconds(env?: { JWT_REFRESH_THRESHOLD_SECONDS?: string | number | null; JWT_TTL_SECONDS?: string | number | null }) {
  const ttl = getJwtTtlSeconds(env);
  return clampSeconds(env?.JWT_REFRESH_THRESHOLD_SECONDS, Math.min(REFRESH_THRESHOLD_SECONDS, Math.max(5 * 60, Math.trunc(ttl / 2))), 5 * 60, Math.max(5 * 60, ttl - 60));
}
export const AUTH_COOKIE_NAME = "inventory_cf_session";

export type AuthUser = {
  id: number;
  username: string;
  role: Role;
  must_change_password?: number;
  acl_version?: number;
  permission_template_code?: string | null;
  permissions?: Record<string, boolean>;
  data_scope_type?: 'all' | 'department' | 'warehouse' | 'department_warehouse';
  data_scope_value?: string | null;
  data_scope_value2?: string | null;
};

const authRequestCache = new WeakMap<Request, {
  token?: string;
  user?: AuthUser;
  role_level?: number;
}>();


function b64uEncode(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64uDecode(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256(key: CryptoKey, data: string) {
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

const hmacKeyCache = new Map<string, Promise<CryptoKey>>();

async function importHmacKey(secret: string) {
  const cached = hmacKeyCache.get(secret);
  if (cached) return cached;
  const promise = crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  ).catch((error) => {
    hmacKeyCache.delete(secret);
    throw error;
  });
  hmacKeyCache.set(secret, promise);
  return promise;
}

export async function signJwt(payload: any, secret: string, expSeconds: number) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expSeconds };
  const h = b64uEncode(new TextEncoder().encode(JSON.stringify(header)));
  const p = b64uEncode(new TextEncoder().encode(JSON.stringify(body)));
  const data = `${h}.${p}`;
  const key = await importHmacKey(secret);
  const sig = await hmacSha256(key, data);
  return `${data}.${b64uEncode(sig)}`;
}

export async function verifyJwt(token: string, secret: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const data = `${h}.${p}`;
    const key = await importHmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, b64uDecode(s), new TextEncoder().encode(data));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64uDecode(p)));
    if (!payload || typeof payload !== "object") return null;

    const now = Math.floor(Date.now() / 1000);
    const expRaw = (payload as any).exp;
    if (expRaw !== undefined) {
      const exp = Number(expRaw);
      if (!Number.isFinite(exp)) return null;
      if (now >= exp) return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function roleLevel(role: Role) {
  return role === "admin" ? 3 : role === "operator" ? 2 : 1;
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  const parts = cookie.split(/;\s*/);
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(idx + 1));
  }
  return null;
}

export function getBearer(request: Request) {
  const h = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function getAuthToken(request: Request) {
  return getCookie(request, AUTH_COOKIE_NAME) || getBearer(request);
}

export function buildAuthCookie(token: string, maxAgeSeconds = JWT_TTL_SECONDS) {
  const attrs = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`,
  ];
  return attrs.join("; ");
}

export function buildClearAuthCookie() {
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function assertPasswordChangePolicy(request: Request, user: AuthUser) {
  if (Number(user.must_change_password || 0) !== 1) return;
  let path = '';
  try {
    path = new URL(request.url).pathname;
  } catch {}
  if (path === '/api/auth/change-password' || path === '/api/auth/logout' || path === '/api/auth/me') return;
  throw Object.assign(new Error('请先修改密码后再继续操作'), {
    status: 403,
    code: 'PASSWORD_CHANGE_REQUIRED',
  });
}

export async function requireAuth(
  env: { DB: D1Database; JWT_SECRET?: string },
  request: Request,
  minRole: Role = "viewer"
): Promise<AuthUser> {
  const token = getAuthToken(request);
  if (token) {
    const reqCache = authRequestCache.get(request);
    if (reqCache?.token === token && reqCache.user && Number(reqCache.role_level || 0) >= roleLevel(minRole)) {
      assertPasswordChangePolicy(request, reqCache.user);
      return reqCache.user;
    }
  }
  const t = (env as any)?.__timing as any;
  const load = async () => {
    const user = await requireAuthInternal(env, request, minRole);
    const resolvedToken = token || getAuthToken(request);
    if (resolvedToken) {
      authRequestCache.set(request, {
        token: resolvedToken,
        user,
        role_level: roleLevel(user.role),
      });
    }
    return user;
  };
  if (t?.measure) {
    return await t.measure("auth", load);
  }
  return await load();
}

type AuthUserRow = {
  id: number;
  username: string;
  role: Role;
  is_active: number;
  must_change_password?: number;
  token_version?: number;
  acl_version?: number;
  permission_template_code?: string | null;
  data_scope_type?: string | null;
  data_scope_value?: string | null;
  data_scope_value2?: string | null;
};

const AUTH_USER_COLUMNS = [
  'id',
  'username',
  'role',
  'is_active',
  'must_change_password',
  'token_version',
  'acl_version',
  'permission_template_code',
  'data_scope_type',
  'data_scope_value',
  'data_scope_value2',
] as const;

function authDataScopeType(value: unknown): AuthUser['data_scope_type'] {
  const normalized = String(value || '').trim();
  if (normalized === 'department' || normalized === 'warehouse' || normalized === 'department_warehouse') return normalized;
  return 'all';
}

async function loadAuthUserRow(db: D1Database, userId: number): Promise<AuthUserRow | null> {
  try {
    return await db
      .prepare(`SELECT ${AUTH_USER_COLUMNS.join(', ')} FROM users WHERE id=?`)
      .bind(userId)
      .first<AuthUserRow>();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (!message.includes('no such column')) throw error;

    const { results } = await db
      .prepare("SELECT name FROM pragma_table_info('users')")
      .all<{ name?: string | null }>();
    const available = new Set((results || []).map((row) => String(row?.name || '').trim()).filter(Boolean));
    if (!['id', 'username', 'role', 'is_active'].every((column) => available.has(column))) throw error;
    const columns = AUTH_USER_COLUMNS.filter((column) => available.has(column));
    return await db
      .prepare(`SELECT ${columns.join(', ')} FROM users WHERE id=?`)
      .bind(userId)
      .first<AuthUserRow>();
  }
}

async function requireAuthInternal(
  env: { DB: D1Database; JWT_SECRET?: string; JWT_TTL_SECONDS?: string | number | null; JWT_REFRESH_THRESHOLD_SECONDS?: string | number | null; __refresh_token?: string | null },
  request: Request,
  minRole: Role
): Promise<AuthUser> {
  const secret = env.JWT_SECRET;
  if (!secret) throw Object.assign(new Error("缺少 JWT_SECRET"), { status: 500 });
  const token = getAuthToken(request);
  if (!token) throw Object.assign(new Error("未登录"), { status: 401 });

  const payload = await verifyJwt(token, secret);
  if (!payload?.sub) throw Object.assign(new Error("登录已过期"), { status: 401 });

  const userId = Number(payload.sub);
  const row = await loadAuthUserRow(env.DB, userId);
  if (!row || Number(row.is_active) !== 1) throw Object.assign(new Error("账号已禁用"), { status: 403 });

  const user: AuthUser = {
    id: Number(row.id),
    username: String(row.username || ''),
    role: row.role,
    must_change_password: Number(row.must_change_password || 0),
    acl_version: Number(row.acl_version || 0),
    permission_template_code: row.permission_template_code == null ? null : String(row.permission_template_code),
    data_scope_type: authDataScopeType(row.data_scope_type),
    data_scope_value: row.data_scope_value == null ? null : String(row.data_scope_value),
    data_scope_value2: row.data_scope_value2 == null ? null : String(row.data_scope_value2),
  };
  const tokenVersion = Number(payload.tv || 0);
  const storedTokenVersion = Number(row.token_version || 0);
  if (tokenVersion !== storedTokenVersion) throw Object.assign(new Error("登录已失效，请重新登录"), { status: 401 });

  if (roleLevel(user.role) < roleLevel(minRole)) throw Object.assign(new Error("权限不足"), { status: 403 });
  assertPasswordChangePolicy(request, user);

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = Number(payload.exp || 0);
    const remaining = exp ? exp - nowSec : 0;
    const path = (() => {
      try { return new URL(request.url).pathname; } catch { return ''; }
    })();
    const isMeEndpoint = path === '/api/auth/me';
    const eagerRefresh = !exp || remaining < getJwtRefreshThresholdSeconds(env);
    const nearExpiryRefresh = !exp || remaining < 5 * 60;
    const shouldRefresh = isMeEndpoint ? nearExpiryRefresh : eagerRefresh;
    if (shouldRefresh) {
      env.__refresh_token = await signJwt(
        { sub: user.id, u: user.username, r: user.role, tv: storedTokenVersion },
        secret,
        getJwtTtlSeconds(env)
      );
    }
  } catch {}
  return user;
}

export function json(ok: boolean, data?: any, message?: string, status = 200, errorCode?: string) {
  return Response.json({ ok, data, message, error_code: errorCode }, { status });
}

export const GENERIC_SERVER_ERROR_MESSAGE = "服务异常";

// Driver/runtime text that must never reach a client: it exposes table, column and
// query shape. App-level throws (validation messages) stay verbatim.
const INTERNAL_ERROR_SIGNATURES = [
  'd1_error',
  'sqlite',
  'no such table',
  'no such column',
  'no such function',
  'syntax error',
  'constraint failed',
  'json path error',
  'network connection lost',
  'cannot read properties',
  'is not a function',
  'is not defined',
];

type HttpErrorLike = { status?: unknown; message?: unknown; error_code?: unknown; code?: unknown };

export function isInternalErrorMessage(message: string) {
  const probe = message.toLowerCase();
  return INTERNAL_ERROR_SIGNATURES.some((signature) => probe.includes(signature));
}

export function errorResponse(e: unknown) {
  const fields: HttpErrorLike = e && typeof e === 'object' ? e : {};
  const declaredStatus = Number(fields.status || 0);
  const message = typeof fields.message === 'string' ? fields.message.trim() : '';
  const explicitCode = typeof fields.error_code === 'string' || typeof fields.error_code === 'number' ? String(fields.error_code).trim() : '';
  const driverCode = typeof fields.code === 'string' || typeof fields.code === 'number' ? String(fields.code).trim() : '';
  const status = declaredStatus > 0 ? declaredStatus : 500;
  const errorCode = explicitCode || (declaredStatus > 0 ? driverCode : '') || undefined;
  if (!message || isInternalErrorMessage(message)) {
    if (message) console.error('unhandled route error', message);
    return json(false, null, GENERIC_SERVER_ERROR_MESSAGE, status, errorCode);
  }
  return json(false, null, message, status, errorCode);
}
