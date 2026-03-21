import { reactive } from "vue";
import { apiGet, apiPost, apiRequestJson } from "../api/client";
import type { Role } from "../utils/roles";
import { hasRole } from "../utils/roles";
import type { PermissionCode } from "../utils/permissions";
import { hasPermission } from "../utils/permissions";

export type User = { id: number; username: string; role: Role; must_change_password?: number; permission_template_code?: string | null; permissions?: Record<string, boolean>; data_scope_type?: 'all' | 'department' | 'warehouse' | 'department_warehouse'; data_scope_value?: string | null; data_scope_value2?: string | null };
type LoginResponse = { ok: boolean; data: { user: User; require_captcha?: boolean; locked_until_ms?: number; locked_until?: string }; message?: string };
const state = reactive<{ user: User | null; loading: boolean }>({ user: null, loading: false });
export const useAuth = () => state;
export async function fetchMe() { state.loading = true; try { const r = await apiGet<{ ok: boolean; data: { user: User } }>("/api/auth/me"); state.user = r.data.user; return state.user; } catch (e) { state.user = null; throw e; } finally { state.loading = false; } }
export const login = (username: string, password: string) => loginWithCaptcha(username, password);
export async function loginWithCaptcha(username: string, password: string, turnstile_token?: string) {
  try {
    const r = await apiRequestJson<LoginResponse>("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password, turnstile_token }) }, { handleUnauthorized: false });
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
export function logout() { apiPost('/api/auth/logout', {}).catch(() => {}); state.user = null; }
export function can(min: Role) { return hasRole(state.user?.role, min); }
export function canPerm(code: PermissionCode) { return hasPermission(state.user, code); }
