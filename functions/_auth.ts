type Role = "admin" | "operator" | "viewer";

// 登录态有效期（秒）：1 天。
// 配合滑动续期：只要有接口调用通过鉴权，就会刷新 token。
export const JWT_TTL_SECONDS = 24 * 3600;

// 续期节流阈值（秒）：当 token 剩余时间小于该值时才刷新。
// 建议设置为 TTL 的一半左右。这里取 12 小时。
export const REFRESH_THRESHOLD_SECONDS = 12 * 3600;

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
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const key = await importHmacKey(secret);
  const ok = await crypto.subtle.verify("HMAC", key, b64uDecode(s), new TextEncoder().encode(data));
  if (!ok) return null;
  const payload = JSON.parse(new TextDecoder().decode(b64uDecode(p)));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) return null;
  return payload;
}

export function roleLevel(role: Role) {
  return role === "admin" ? 3 : role === "operator" ? 2 : 1;
}

export function getBearer(request: Request) {
  const h = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
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
  const token = getBearer(request);
  if (!token) throw Object.assign(new Error("未登录"), { status: 401 });

  const payload = await verifyJwt(token, secret);
  if (!payload?.sub) throw Object.assign(new Error("登录已过期"), { status: 401 });

  const userId = Number(payload.sub);
  const u = await env.DB.prepare(
    "SELECT id, username, role, is_active, must_change_password FROM users WHERE id=?"
  ).bind(userId).first<any>();
  if (!u || Number(u.is_active) !== 1) throw Object.assign(new Error("账号已禁用"), { status: 403 });

  const user: AuthUser = { id: u.id, username: u.username, role: u.role as Role, must_change_password: u.must_change_password };
  if (roleLevel(user.role) < roleLevel(minRole)) throw Object.assign(new Error("权限不足"), { status: 403 });

  // 滑动续期（带节流）：只有当 token 剩余时间较短时才刷新，避免每次请求都下发新 token。
  // 全局 middleware 会把它写入响应头，前端收到后更新 localStorage。
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const exp = Number(payload?.exp || 0);
    const remaining = exp ? exp - nowSec : 0;
    if (!exp || remaining < REFRESH_THRESHOLD_SECONDS) {
      (env as any).__refresh_token = await signJwt(
        { sub: user.id, u: user.username, r: user.role },
        secret,
        JWT_TTL_SECONDS
      );
    }
  } catch {
    // 不影响正常请求
  }
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
