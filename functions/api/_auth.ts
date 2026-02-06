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

export function errorResponse(status: number, message: string, extra?: Record<string, unknown>) {
  return json({ ok: false, message, ...(extra ?? {}) }, { status });
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

export async function requireAuth(req: Request, env: any, minRole: Role = "viewer") {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, res: errorResponse(401, "未登录") };

  const secret = env?.JWT_SECRET;
  if (!secret) return { ok: false as const, res: errorResponse(500, "缺少 JWT_SECRET 环境变量") };

  const payload = await verifyJwt(token, secret);
  if (!payload) return { ok: false as const, res: errorResponse(401, "登录已过期或无效") };

  const roleOk = ROLE_WEIGHT[payload.role] >= ROLE_WEIGHT[minRole];
  if (!roleOk) return { ok: false as const, res: errorResponse(403, "权限不足") };

  const user: JwtUser = { id: payload.sub, username: payload.username, role: payload.role };
  return { ok: true as const, user };
}
