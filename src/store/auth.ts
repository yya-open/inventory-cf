import { reactive } from "vue";
import { apiPost, apiRequestJson } from "../api/client";
import type { Role } from "../utils/roles";
import { hasRole } from "../utils/roles";
import type { PermissionCode } from "../utils/permissions";
import { hasPermission } from "../utils/permissions";

export type User = { id: number; username: string; role: Role; must_change_password?: number; permission_template_code?: string | null; permissions?: Record<string, boolean>; data_scope_type?: 'all' | 'department' | 'warehouse' | 'department_warehouse'; data_scope_value?: string | null; data_scope_value2?: string | null };
type LoginResponse = { ok: boolean; data: { user: User; require_captcha?: boolean; locked_until_ms?: number; locked_until?: string }; message?: string };
const state = reactive<{ user: User | null; loading: boolean }>({ user: null, loading: false });
const AUTH_CACHE_KEY = 'inventory:auth-user-cache';
const AUTH_CACHE_TTL_MS = 30 * 60_000;
const AUTH_REFRESH_SOFT_TTL_MS = AUTH_CACHE_TTL_MS;
let pendingFetchMe: Promise<User> | null = null;
let authCacheTimestamp = 0;
let authRequestEpoch = 0;

export function getAuthRequestEpoch() {
  return authRequestEpoch;
}

export function bumpAuthRequestEpoch() {
  authRequestEpoch += 1;
  return authRequestEpoch;
}

export function isAuthRequestEpochCurrent(epoch: number) {
  return epoch === authRequestEpoch;
}

function getSessionStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function writeAuthCache(user: User | null) {
  const storage = getSessionStorage();
  if (!storage) return;
  if (!user) {
    authCacheTimestamp = 0;
    storage.removeItem(AUTH_CACHE_KEY);
    return;
  }
  authCacheTimestamp = Date.now();
  storage.setItem(AUTH_CACHE_KEY, JSON.stringify({ user, ts: authCacheTimestamp }));
}

function readAuthCache(maxAgeMs = AUTH_CACHE_TTL_MS): User | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: User; ts?: number };
    if (!parsed?.user || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > maxAgeMs) return null;
    authCacheTimestamp = parsed.ts;
    return parsed.user;
  } catch {
    return null;
  }
}

export function hydrateAuthFromCache(maxAgeMs = AUTH_CACHE_TTL_MS) {
  const cached = readAuthCache(maxAgeMs);
  if (cached) state.user = cached;
  return cached;
}

export function getAuthCacheAgeMs() {
  return authCacheTimestamp ? Date.now() - authCacheTimestamp : Number.POSITIVE_INFINITY;
}

export function shouldRefreshAuthInBackground() {
  return getAuthCacheAgeMs() >= AUTH_REFRESH_SOFT_TTL_MS;
}

function clearAuthCache() {
  writeAuthCache(null);
}

export const useAuth = () => state;

export async function fetchMe(options?: { force?: boolean; handleUnauthorized?: boolean }) {
  const force = Boolean(options?.force);
  const handleUnauthorized = options?.handleUnauthorized !== false;
  const requestEpoch = authRequestEpoch;
  if (!force) {
    const cached = state.user || hydrateAuthFromCache();
    if (cached) return cached;
    if (pendingFetchMe) return pendingFetchMe;
  }
  state.loading = true;
  const task = apiRequestJson<{ ok: boolean; data: { user: User } }>("/api/auth/me", { method: 'GET' }, { handleUnauthorized }).then((r) => {
    if (!isAuthRequestEpochCurrent(requestEpoch)) return r.data.user;
    bumpAuthRequestEpoch();
    state.user = r.data.user;
    writeAuthCache(r.data.user);
    return r.data.user;
  }).catch((e) => {
    if (isAuthRequestEpochCurrent(requestEpoch)) {
      state.user = null;
      clearAuthCache();
    }
    throw e;
  }).finally(() => {
    state.loading = false;
    pendingFetchMe = null;
  });
  pendingFetchMe = task;
  return task;
}

export const login = (username: string, password: string) => loginWithCaptcha(username, password);
export async function loginWithCaptcha(username: string, password: string, turnstile_token?: string) {
  try {
    const r = await apiRequestJson<LoginResponse>("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password, turnstile_token }) }, { handleUnauthorized: false });
    bumpAuthRequestEpoch();
    state.user = r.data.user;
    writeAuthCache(r.data.user);
    return r.data.user;
  } catch (e: any) {
    const response = e?.response;
    if (response?.data?.require_captcha) e.require_captcha = true;
    if (response?.data?.locked_until_ms != null) e.locked_until_ms = response.data.locked_until_ms;
    if (response?.data?.locked_until) e.locked_until = response.data.locked_until;
    throw e;
  }
}
export async function logout() {
  bumpAuthRequestEpoch();
  state.user = null;
  clearAuthCache();
  try {
    await apiPost('/api/auth/logout', {});
  } catch {}
}
export function can(min: Role) { return hasRole(state.user?.role, min); }
export function canPerm(code: PermissionCode) { return hasPermission(state.user, code); }
