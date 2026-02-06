// functions/api/_auth.ts
// Shared auth helpers for Pages Functions (D1 + JWT)

type Role = "admin" | "operator" | "viewer";

const ROLE_WEIGHT: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(a: any, b?: any, extra?: Record<string, unknown>) {
  // Usage:
  // 1) errorResponse(status, message, extra?)
  // 2) errorResponse(error) where error can be Error or {status,message}
  let status = 500;
  let message = "服务器错误";
  let ex: Record<string, unknown> | undefined = extra;

  if (typeof a === "number") {
    status = a;
    message = String(b ?? message);
  } else if (a?.status && a?.message) {
    status = Number(a.status);
    message = String(a.message);
    ex = (a.extra ?? ex) as any;
  } else if (a instanceof Error) {
    message = a.message || message;
  } else if (typeof a === "string") {
    message = a;
    status = 400;
  }

  return json({ ok: false, message, ...(ex ?? {}) }, { status });
}

function base64UrlToBytes(b64url: string) {
  // base64url -> base64
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return b64;
}

async function hmacSha256(secret: string, data: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(sig);
}

function safeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

export type JwtUser = {
  id: number;
  username: string;
  role: Role;
};

export type JwtPayload = {
  sub: number; // user id
  username: string;
  role: Role;
  iat: number;
  exp: number;
};

export async function signJwt(payload: Omit<JwtPayload, "iat" | "exp">, secret: string, expiresInSec = 60 * 60 * 24) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = { ...payload, iat: now, exp: now + expiresInSec };

  const enc = new TextEncoder();
  const headerB64 = bytesToBase64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = bytesToBase64Url(enc.encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await hmacSha256(secret, signingInput);
  const sigB64 = bytesToBase64Url(sig);
  return `${signingInput}.${sigB64}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [h, p, s] = parts;
  // verify signature
  const signingInput = `${h}.${p}`;
  const expected = await hmacSha256(secret, signingInput);
  const got = base64UrlToBytes(s);

  if (!safeEqual(expected, got)) return null;

  // decode payload
  const payloadJson = new TextDecoder().decode(base64UrlToBytes(p));
  let payload: JwtPayload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) return null;

  // role sanity
  if (!payload.role || !(payload.role in ROLE_WEIGHT)) return null;

  return payload;
}

export function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function requireAuth(a: any, b: any, minRole: Role = "viewer") {
  // Accept both orders: (env, request, role) OR (request, env, role)
  const req: Request = a instanceof Request ? a : b;
  const env: any = a instanceof Request ? b : a;

  const token = getBearerToken(req);
  if (!token) throw { status: 401, message: "未登录" };

  const secret = env?.JWT_SECRET;
  if (!secret) throw { status: 500, message: "缺少 JWT_SECRET 环境变量" };

  const payload = await verifyJwt(token, secret);
  if (!payload) throw { status: 401, message: "登录已过期或无效" };

  const roleOk = ROLE_WEIGHT[payload.role] >= ROLE_WEIGHT[minRole];
  if (!roleOk) throw { status: 403, message: "权限不足" };

  const user: JwtUser = { id: payload.sub, username: payload.username, role: payload.role };
  return user;
}
