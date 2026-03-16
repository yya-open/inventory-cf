import { reactive } from "vue";
import { apiGet, apiPost } from "../api/client";

export type Role = "admin" | "operator" | "viewer";
export type User = { id: number; username: string; role: Role; must_change_password?: number };

const state = reactive<{
  user: User | null;
  loading: boolean;
}>(
  {
    user: null,
    loading: false,
  }
);

export function useAuth() {
  return state;
}

export async function fetchMe() {
  state.loading = true;
  try {
    const r = await apiGet<{ ok: boolean; data: { user: User } }>("/api/auth/me");
    state.user = r.data.user;
    return state.user;
  } catch (e) {
    state.user = null;
    throw e;
  } finally {
    state.loading = false;
  }
}

export async function login(username: string, password: string) {
  return loginWithCaptcha(username, password);
}

export async function loginWithCaptcha(username: string, password: string, turnstile_token?: string) {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password, turnstile_token }),
  });

  const t = await r.text();
  let j: any = null;
  try { j = JSON.parse(t); } catch { j = { ok: false, message: t || "登录失败" }; }

  if (!r.ok || !j?.ok) {
    const err: any = new Error(j?.message || "登录失败");
    if (j?.data?.require_captcha) err.require_captcha = true;
    if (j?.data?.locked_until_ms != null) err.locked_until_ms = j.data.locked_until_ms;
    if (j?.data?.locked_until) err.locked_until = j.data.locked_until;
    throw err;
  }

  state.user = j.data.user;
  return j.data.user as User;
}

export function logout() {
  apiPost('/api/auth/logout', {}).catch(() => {});
  state.user = null;
}

export function can(min: Role) {
  const level = (r: Role) => (r === "admin" ? 3 : r === "operator" ? 2 : 1);
  if (!state.user) return false;
  return level(state.user.role) >= level(min);
}
