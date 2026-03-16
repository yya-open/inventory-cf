import { useAuth } from "../store/auth";

function handleUnauthorized(message?: string) {
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
  try { return JSON.parse(t); } catch { return { ok: false, message: t || "请求失败" }; }
}

async function requestJson<T>(path: string, init: RequestInit) {
  const r = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.headers || {}),
    },
  });
  const j = await parseJson(r);
  if (r.status === 401) return handleUnauthorized(j?.message);
  if (!r.ok || !j.ok) throw new Error(j.message || "请求失败");
  return j as T;
}

export async function apiGet<T>(path: string) {
  return requestJson<T>(path, { method: "GET" });
}

export async function apiPost<T>(path: string, body: any) {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiPut<T>(path: string, body: any) {
  return requestJson<T>(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T>(path: string, body?: any) {
  return requestJson<T>(path, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiPostForm<T>(path: string, form: FormData) {
  return requestJson<T>(path, {
    method: "POST",
    body: form,
  });
}

export async function apiDownload(path: string, filename: string) {
  const r = await fetch(path, { method: "GET", credentials: "include" });
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
