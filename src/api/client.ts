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

async function parseJson(r: Response) {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { ok: false, message: t || "请求失败" }; }
}

export async function apiGet<T>(path: string) {
  const r = await fetch(path, { method: "GET", headers: { ...authHeaders() } });
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
  const j = await parseJson(r);
  if (r.status === 401) return handleUnauthorized(j?.message);
  if (!r.ok || !j.ok) throw new Error(j.message || "请求失败");
  return j as T;
}
