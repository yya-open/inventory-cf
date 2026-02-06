import { reactive } from "vue";
import { apiGet, apiPost } from "../api/client";

export type Role = "admin" | "operator" | "viewer";
export type User = { id: number; username: string; role: Role; must_change_password?: number };

const state = reactive<{
  token: string;
  user: User | null;
  loading: boolean;
}>({
  token: localStorage.getItem("token") || "",
  user: null,
  loading: false,
});

export function useAuth() {
  return state;
}

export function setToken(t: string) {
  state.token = t;
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}

export async function fetchMe() {
  if (!state.token) { state.user = null; return null; }
  state.loading = true;
  try {
    const r = await apiGet<{ ok: boolean; data: { user: User } }>("/api/auth/me");
    state.user = r.data.user;
    return state.user;
  } finally {
    state.loading = false;
  }
}

export async function login(username: string, password: string) {
  const r = await apiPost<{ ok: boolean; data: { token: string; user: User } }>(
    "/api/auth/login",
    { username, password }
  );
  setToken(r.data.token);
  state.user = r.data.user;
  return r.data.user;
}

export function logout() {
  setToken("");
  state.user = null;
}

export function can(min: Role) {
  const level = (r: Role) => (r === "admin" ? 3 : r === "operator" ? 2 : 1);
  if (!state.user) return false;
  return level(state.user.role) >= level(min);
}
