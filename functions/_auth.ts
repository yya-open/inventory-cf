type Role = "admin" | "operator" | "viewer";

export const JWT_TTL_SECONDS = 24 * 3600;
export const REFRESH_THRESHOLD_SECONDS = 12 * 3600;
export const AUTH_COOKIE_NAME = "inventory_cf_session";

export type AuthUser = { id: number; username: string; role: Role; must_change_password?: number };

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

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
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

export async function requireAuth(
  env: { DB: D1Database; JWT_SECRET?: string },
  request: Request,
  minRole: Role = "viewer"
): Promise<AuthUser> {
  const t = (env as any)?.__timing as any;
  if (t?.measure) {
    return await t.measure("auth", async () => requireAuthInternal(env, request, minRole));
  }
  return await requireAuthInternal(env, request, minRole);
}

async function requireAuthInternal(
  env: { DB: D1Database; JWT_SECRET?: string },
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
  let u: any = null;
  try {
    u = await env.DB
      .prepare("SELECT id, username, role, is_active, must_change_password, token_version FROM users WHERE id=?")
      .bind(userId)
      .first<any>();
  } catch (e: any) {
    if (String(e?.message || "").includes("no such column") && String(e?.message || "").includes("token_version")) {
      u = await env.DB
        .prepare("SELECT id, username, role, is_active, must_change_password FROM users WHERE id=?")
        .bind(userId)
        .first<any>();
      if (u) u.token_version = 0;
    } else {
      throw e;
    }
  }
  if (!u || Number(u.is_active) !== 1) throw Object.assign(new Error("账号已禁用"), { status: 403 });

  const user: AuthUser = { id: u.id, username: u.username, role: u.role as Role, must_change_password: u.must_change_password };
  const tv = Number((payload as any)?.tv || 0);
  const dbTv = Number((u as any).token_version || 0);
  if (tv !== dbTv) throw Object.assign(new Error("登录已失效，请重新登录"), { status: 401 });

  if (roleLevel(user.role) < roleLevel(minRole)) throw Object.assign(new Error("权限不足"), { status: 403 });

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = Number(payload?.exp || 0);
    const remaining = exp ? exp - nowSec : 0;
    if (!exp || remaining < REFRESH_THRESHOLD_SECONDS) {
      (env as any).__refresh_token = await signJwt(
        { sub: user.id, u: user.username, r: user.role, tv: dbTv },
        secret,
        JWT_TTL_SECONDS
      );
    }
  } catch {}
  return user;
}

export function json(ok: boolean, data?: any, message?: string, status = 200) {
  return Response.json({ ok, data, message }, { status });
}

export function errorResponse(e: any) {
  const status = Number(e?.status || 500);
  const msg = e?.message || "服务异常";
  return json(false, null, msg, status);
}
