<template>
  <div class="login-page">
    <div class="login-shell">
      <section class="login-wallpaper" aria-hidden="true">
        <img class="login-wallpaper__image" :src="loginWallpaper" alt="" />
      </section>

      <section class="login-card" aria-label="登录表单">
        <div class="login-card__eyebrow">系统登录</div>
        <div class="login-card__title">请输入账号密码</div>
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
import loginWallpaper from "../assets/login-wallpaper.svg";
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
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background:
    radial-gradient(circle at 14% 18%, rgba(59, 130, 246, 0.14), transparent 24%),
    radial-gradient(circle at 88% 14%, rgba(20, 184, 166, 0.14), transparent 22%),
    radial-gradient(circle at 72% 88%, rgba(245, 158, 11, 0.10), transparent 20%),
    linear-gradient(180deg, #f5f7fb 0%, #eef2f7 100%);
}

.login-shell {
  width: min(1040px, 100%);
  min-height: 560px;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr);
  overflow: hidden;
  border: 1px solid #d9e1ea;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.11);
}

.login-wallpaper {
  position: relative;
  min-width: 0;
  min-height: 560px;
  overflow: hidden;
  border-right: 1px solid #e2e8f0;
  background: #dceaf6;
}

.login-wallpaper::before,
.login-wallpaper::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.login-wallpaper::before {
  z-index: 1;
  background:
    linear-gradient(90deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0)),
    radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.34), transparent 34%);
}

.login-wallpaper::after {
  z-index: 2;
  box-shadow: inset 0 0 80px rgba(15, 23, 42, 0.10);
}

.login-wallpaper__image {
  width: 100%;
  height: 100%;
  min-height: 560px;
  display: block;
  object-fit: cover;
  transform: scale(1.02);
}

.login-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 52px 44px;
  background: #ffffff;
}

.login-card__eyebrow {
  color: #315b8c;
  font-size: 14px;
  font-weight: 600;
}

.login-card__title {
  margin: 10px 0 28px;
  color: #182235;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
}

.login-submit {
  width: 100%;
  height: 42px;
  margin-top: 2px;
  border-radius: 6px;
  font-weight: 600;
  border: 0;
  background: linear-gradient(135deg, #3b82f6 0%, #14b8a6 100%);
  box-shadow: 0 12px 22px rgba(59, 130, 246, 0.18);
}

.login-submit:hover {
  background: linear-gradient(135deg, #4c8df7 0%, #17c0a9 100%);
}

.login-submit:focus-visible {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14), 0 12px 22px rgba(59, 130, 246, 0.18);
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
  color: #999;
  font-size: 12px;
  margin-top: 6px;
}

:deep(.login-card .el-form-item__label) {
  padding-bottom: 7px;
  color: #465267;
  font-weight: 600;
}

:deep(.login-card .el-input__wrapper) {
  min-height: 42px;
  border-radius: 6px;
  background: #fbfdff;
  box-shadow: 0 0 0 1px #d8e0ea inset;
}

:deep(.login-card .el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #aebccc inset;
}

:deep(.login-card .el-input__wrapper.is-focus) {
  background: #ffffff;
  box-shadow: 0 0 0 1px #409eff inset;
}

@media (max-width: 980px) {
  .login-shell {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .login-wallpaper {
    padding: 34px;
    border-right: 0;
    border-bottom: 1px solid #e1e6ef;
    min-height: 300px;
  }

  .login-wallpaper__image {
    min-height: 300px;
  }
}

@media (max-width: 640px) {
  .login-page {
    align-items: stretch;
    padding: 12px;
  }

  .login-shell {
    align-self: center;
    border-radius: 6px;
  }

  .login-wallpaper {
    display: none;
  }

  .login-card {
    padding: 32px 22px;
  }

  .login-card__title {
    font-size: 22px;
  }
}
</style>
