<template>
  <div class="login-page">
    <div class="login-shell">
      <section class="login-card" aria-label="登录表单">
        <div class="login-card__header">
          <div class="login-card__mark">IC</div>
          <div>
            <div class="login-card__eyebrow">配件仓管理系统</div>
            <div class="login-card__title">登录</div>
          </div>
        </div>
        <div class="login-card__subtitle">请输入授权账号继续。</div>

        <el-form label-position="top" @submit.prevent>
          <el-form-item label="账号">
            <el-input
              v-model="username"
              placeholder="请输入账号"
              autocomplete="username"
              @keyup.enter="doLogin"
            />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="password"
              type="password"
              show-password
              placeholder="请输入密码"
              autocomplete="current-password"
              @keyup.enter="doLogin"
            />
          </el-form-item>

          <div v-show="siteKey && requireCaptcha" class="login-turnstile">
            <div ref="turnstileEl" class="login-turnstile__inner" />
          </div>

          <el-button type="primary" class="login-submit" :loading="loading" @click="doLogin">
            {{ loading ? '登录中…' : '登录' }}
          </el-button>
        </el-form>
      </section>
    </div>

    <el-dialog
      v-model="showChange"
      title="请修改初始密码"
      width="420px"
      :close-on-click-modal="false"
      :show-close="false"
      class="password-dialog password-dialog--change"
    >
      <div class="password-dialog__hint">
        为了账号安全，请先完成密码更新后继续使用系统。
      </div>
      <el-form class="password-dialog__form" label-position="top">
        <el-form-item label="旧密码">
          <el-input v-model="oldP" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="newP" type="password" show-password autocomplete="new-password" />
          <div class="password-dialog__tip">密码长度需为 6-64 位，且必须同时包含字母和数字</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" :loading="changing" @click="changePassword">
          确认修改
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "../utils/el-message";
import { loginWithCaptcha, useAuth } from "../store/auth";
import { firstAccessibleRoute } from "../utils/moduleAccess";
import { apiPost } from "../api/client";
import { validatePassword } from "../utils/password";

const route = useRoute();
const router = useRouter();
const auth = useAuth();

const username = ref("");
const password = ref("");
const loading = ref(false);

const siteKey = (import.meta as any).env?.VITE_TURNSTILE_SITEKEY || "";
const requireCaptcha = ref(false);
const turnstileToken = ref("");
const turnstileEl = ref<HTMLElement | null>(null);
let widgetId: string | null = null;
let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).turnstile?.render) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-inventory-turnstile]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Turnstile script failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.inventoryTurnstile = '1';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Turnstile script failed to load')), { once: true });
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

async function renderTurnstile() {
  if (!siteKey || !requireCaptcha.value) return;
  await loadTurnstileScript();
  await nextTick();
  const el = turnstileEl.value;
  const ts: any = (window as any).turnstile;
  if (!el || !ts?.render) return;

  try {
    if (widgetId) {
      ts.remove(widgetId);
      widgetId = null;
    }
  } catch {}

  ts.ready(() => {
    try {
      widgetId = ts.render(el, {
        sitekey: siteKey,
        callback: (t: string) => { turnstileToken.value = t; },
        "expired-callback": () => { turnstileToken.value = ""; },
        "error-callback": () => { turnstileToken.value = ""; },
      });
    } catch {}
  });
}

onBeforeUnmount(() => {
  const ts: any = (window as any).turnstile;
  if (ts && widgetId) {
    try { ts.remove(widgetId); } catch {}
  }
  widgetId = null;
});

const showChange = ref(false);
const oldP = ref("");
const newP = ref("");
const changing = ref(false);

async function doLogin() {
  loading.value = true;
  try {
    const u = await loginWithCaptcha(username.value, password.value, turnstileToken.value || undefined);
    if (u.must_change_password) {
      showChange.value = true;
      return;
    }
    ElMessage.success("登录成功");
    const redirect = (route.query.redirect as string) || firstAccessibleRoute(auth.user);
    router.replace(redirect);
  } catch (e: any) {
    if (e?.locked_until_ms) {
      const dt = new Date(Number(e.locked_until_ms));
      const pad = (n: number) => String(n).padStart(2, "0");
      const s = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
      ElMessage.error(`尝试次数过多，请稍后再试（锁定至 ${s}）`);
      return;
    }
    if (e?.require_captcha) {
      requireCaptcha.value = true;
      turnstileToken.value = "";
      await renderTurnstile();
      if (!siteKey) ElMessage.error("需要验证码登录，但未配置 VITE_TURNSTILE_SITEKEY");
      else ElMessage.warning("请先完成验证码验证");
      return;
    }
    ElMessage.error(e.message || "登录失败");
  } finally {
    loading.value = false;
  }
}

async function changePassword() {
  const pv = validatePassword(newP.value);
  if (!pv.ok) return ElMessage.warning(pv.msg || "密码不符合规则");
  changing.value = true;
  try {
    await apiPost<any>("/api/auth/change-password", { old_password: oldP.value, new_password: newP.value });
    showChange.value = false;
    ElMessage.success("密码已更新，请重新登录");
    auth.user = null;
    await apiPost("/api/auth/logout", {}).catch(() => {});
    router.replace("/login");
  } catch (e: any) {
    ElMessage.error(e.message || "修改失败");
  } finally {
    changing.value = false;
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  overflow: hidden;
  background:
    radial-gradient(880px 440px at 15% -8%, rgba(79, 70, 229, 0.07), rgba(255, 255, 255, 0) 60%),
    radial-gradient(720px 400px at 88% 108%, rgba(79, 70, 229, 0.05), rgba(255, 255, 255, 0) 55%),
    var(--bg, #f4f5f7);
}

.login-shell {
  position: relative;
  z-index: 1;
  width: min(420px, 100%);
  overflow: hidden;
  border: 1px solid var(--border, #e3e6eb);
  border-radius: var(--radius-xl, 16px);
  background: var(--surface, #ffffff);
  box-shadow: var(--shadow-lg, 0 20px 48px rgba(16, 24, 40, 0.16));
}

.login-card {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  padding: 36px 32px 32px;
  background: var(--surface, #ffffff);
}

.login-card__header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.login-card__mark {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--brand, #4f46e5);
  color: #ffffff;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.02em;
  box-shadow: 0 6px 16px rgba(79, 70, 229, 0.32);
}

.login-card__eyebrow {
  color: var(--muted, #5b6472);
  font-size: 13px;
  font-weight: 600;
}

.login-card__title {
  margin-top: 2px;
  color: var(--ink, #191e28);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.login-card__subtitle {
  margin-top: -8px;
  color: var(--muted, #5b6472);
  font-size: 14px;
  line-height: 1.6;
}

.login-submit {
  width: 100%;
  height: 44px;
  margin-top: 4px;
  border: 1px solid var(--brand, #4f46e5);
  border-radius: 10px;
  background: var(--brand, #4f46e5);
  font-size: 15px;
  font-weight: 700;
  box-shadow: 0 8px 18px rgba(79, 70, 229, 0.24);
  transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.login-submit:hover {
  border-color: var(--brand-hover, #4338ca);
  background: var(--brand-hover, #4338ca);
  box-shadow: 0 10px 22px rgba(79, 70, 229, 0.3);
}

.login-submit:focus-visible {
  box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.16);
}

.login-turnstile {
  margin: 10px 0 16px;
  display: flex;
  justify-content: center;
}

.login-turnstile__inner {
  min-height: 65px;
}

.password-tip {
  color: var(--subtle, #8a93a2);
  font-size: 12px;
  margin-top: 6px;
}

:deep(.login-card .el-form-item__label) {
  padding-bottom: 7px;
  color: var(--ink-secondary, #3d4451);
  font-weight: 600;
}

:deep(.login-card .el-input__wrapper) {
  min-height: 44px;
  border-radius: 10px;
  background: var(--surface-soft, #f8f9fb);
  box-shadow: 0 0 0 1px var(--border-strong, #d3d8e0) inset;
  transition: box-shadow 160ms ease, background-color 160ms ease;
}

:deep(.login-card .el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--subtle, #8a93a2) inset;
}

:deep(.login-card .el-input__wrapper.is-focus) {
  background: var(--surface, #ffffff);
  box-shadow: 0 0 0 1px var(--brand, #4f46e5) inset, 0 0 0 4px rgba(79, 70, 229, 0.12);
}

:deep(.login-card .el-form) {
  display: grid;
  gap: 6px;
}

@media (max-width: 640px) {
  .login-page {
    align-items: stretch;
    padding: 12px;
  }

  .login-shell {
    align-self: center;
    border-radius: var(--radius-lg, 12px);
  }

  .login-card {
    padding: 28px 20px;
  }

  .login-card__title {
    font-size: 22px;
  }
}
</style>
