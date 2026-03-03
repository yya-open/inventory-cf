import { useAuth } from "../store/auth";

function handleUnauthorized(message?: string) {
  // JWT invalid/expired or missing.
  // Clear local auth state and kick user back to login.
  const auth = useAuth();
  auth.token = "";
  auth.user = null as any;
  localStorage.removeItem("token");

  // Avoid infinite redirects.
  const path = window.location.pathname;
  if (path !== "/login") {
    const redirect = encodeURIComponent(path + window.location.search + window.location.hash);
    // Use hard navigation to avoid router import/cycle.
    window.location.href = `/login?redirect=${redirect}`;
  }

  throw new Error(message || "登录已过期，请重新登录");
}

function authHeaders() {
  const { token } = useAuth();
  return token ? { Authorization: `Bearer ${token}` } : {};
}


function decodeJwtExp(token: string): number | null {
  try {
    const p = token.split(".")[1];
    if (!p) return null;
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const json = atob(b64 + pad);
    const payload = JSON.parse(decodeURIComponent(Array.from(json).map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")));
    const exp = Number(payload?.exp);
    return Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

function applyRefreshToken(r: Response) {
  const nt = r.headers.get("X-Auth-Token");
  if (!nt) return;

  const auth = useAuth();
  const cur = auth.token || localStorage.getItem("token") || "";

  const newExp = decodeJwtExp(nt);
  const curExp = cur ? decodeJwtExp(cur) : null;

  // 并发保护：只接受 exp 更大的 token，避免“旧响应”覆盖“新 token”
  if (newExp && (!curExp || newExp > curExp)) {
    auth.token = nt;
    localStorage.setItem("token", nt);
  }
}

async function parseJson(r: Response) {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { ok: false, message: t || "请求失败" }; }
}

export async function apiGet<T>(path: string) {
  const r = await fetch(path, { method: "GET", headers: { ...authHeaders() } });
  applyRefreshToken(r);
  const j = await parseJson(r);
  if (r.status === 401) return handleUnauthorized(j?.message);
  if (!r.ok || !j.ok) throw new Error(j.message || "请求失败");
  return j as T;
}

export async function apiPost<T>(path: string, body: any) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  applyRefreshToken(r);
  const j = await parseJson(r);
  if (r.status === 401) return handleUnauthorized(j?.message);
  if (!r.ok || !j.ok) throw new Error(j.message || "请求失败");
  return j as T;
}

export async function apiPut<T>(path: string, body: any) {
  const r = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  applyRefreshToken(r);
  const j = await parseJson(r);
  if (r.status === 401) return handleUnauthorized(j?.message);
  if (!r.ok || !j.ok) throw new Error(j.message || "请求失败");
  return j as T;
}

export async function apiDelete<T>(path: string, body?: any) {
  const r = await fetch(path, {
    method: "DELETE",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  applyRefreshToken(r);
  const j = await parseJson(r);
  if (r.status === 401) return handleUnauthorized(j?.message);
  if (!r.ok || !j.ok) throw new Error(j.message || "请求失败");
  return j as T;
}


export async function apiPostForm<T>(path: string, form: FormData) {
  const r = await fetch(path, {
    method: "POST",
    headers: { ...authHeaders() },
    body: form,
  });
  applyRefreshToken(r);
  const j = await parseJson(r);
  if (r.status === 401) return handleUnauthorized(j?.message);
  if (!r.ok || !j.ok) throw new Error(j.message || "请求失败");
  return j as T;
}

export async function apiDownload(path: string, filename: string) {
  const r = await fetch(path, { method: "GET", headers: { ...authHeaders() } });
  applyRefreshToken(r);
  if (r.status === 401) {
    const j = await parseJson(r);
    return handleUnauthorized(j?.message);
  }
  if (!r.ok) {
    const j = await parseJson(r);
    throw new Error(j.message || "下载失败");
  }

  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
