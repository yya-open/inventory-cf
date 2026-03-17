import { reactive } from "vue";
import { apiGet, apiPost, apiRequestJson } from "../api/client";

export type Role = "admin" | "operator" | "viewer";
export type User = { id: number; username: string; role: Role; must_change_password?: number };

type LoginResponse = {
  ok: boolean;
  data: {
    user: User;
    require_captcha?: boolean;
    locked_until_ms?: number;
    locked_until?: string;
  };
  message?: string;
};

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
  try {
    const r = await apiRequestJson<LoginResponse>(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, turnstile_token }),
      },
      { handleUnauthorized: false }
    );

    state.user = r.data.user;
    return r.data.user;
  } catch (e: any) {
    const response = e?.response;
    if (response?.data?.require_captcha) e.require_captcha = true;
    if (response?.data?.locked_until_ms != null) e.locked_until_ms = response.data.locked_until_ms;
    if (response?.data?.locked_until) e.locked_until = response.data.locked_until;
    throw e;
  }
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
