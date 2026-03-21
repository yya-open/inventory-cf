import { reactive } from "vue";
import { apiGet, apiPost, apiRequestJson } from "../api/client";
import { hasRole } from "../utils/roles";
import { hasPermission } from "../utils/permissions";
const state = reactive({ user: null, loading: false });
export const useAuth = () => state;
export async function fetchMe() { state.loading = true; try {
    const r = await apiGet("/api/auth/me");
    state.user = r.data.user;
    return state.user;
}
catch (e) {
    state.user = null;
    throw e;
}
finally {
    state.loading = false;
} }
export const login = (username, password) => loginWithCaptcha(username, password);
export async function loginWithCaptcha(username, password, turnstile_token) {
    try {
        const r = await apiRequestJson("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password, turnstile_token }) }, { handleUnauthorized: false });
        state.user = r.data.user;
        return r.data.user;
    }
    catch (e) {
        const response = e?.response;
        if (response?.data?.require_captcha)
            e.require_captcha = true;
        if (response?.data?.locked_until_ms != null)
            e.locked_until_ms = response.data.locked_until_ms;
        if (response?.data?.locked_until)
            e.locked_until = response.data.locked_until;
        throw e;
    }
}
export function logout() { apiPost('/api/auth/logout', {}).catch(() => { }); state.user = null; }
export function can(min) { return hasRole(state.user?.role, min); }
export function canPerm(code) { return hasPermission(state.user, code); }
