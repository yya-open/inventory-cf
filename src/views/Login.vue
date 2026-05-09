<template>
  <div class="login-page">
    <div class="login-shell">
      <section class="login-panel" aria-hidden="true">
        <div class="login-panel__brand">
          <div class="login-panel__mark">IC</div>
          <div>
            <div class="login-panel__name">配件仓管理系统</div>
            <div class="login-panel__desc">库存、资产、盘点与审计统一工作台</div>
          </div>
        </div>
        <div class="login-panel__summary">
          <div class="login-panel__summary-title">运营概览</div>
          <div class="login-panel__metrics">
            <div class="login-panel__metric">
              <span>库存流转</span>
              <strong>实时</strong>
            </div>
            <div class="login-panel__metric">
              <span>盘点任务</span>
              <strong>可追溯</strong>
            </div>
            <div class="login-panel__metric">
              <span>权限审计</span>
              <strong>已启用</strong>
            </div>
          </div>
        </div>
        <div class="login-panel__list">
          <div class="login-panel__list-row">
            <span>配件仓</span>
            <b>入库、出库、预警</b>
          </div>
          <div class="login-panel__list-row">
            <span>电脑/显示器仓</span>
            <b>台账、二维码、归还</b>
          </div>
          <div class="login-panel__list-row">
            <span>系统运维</span>
            <b>备份、报表、发布检查</b>
          </div>
        </div>
      </section>

      <section class="login-card" aria-label="登录表单">
        <div class="login-card__eyebrow">系统登录</div>
        <div class="login-card__title">欢迎回来</div>
        <div class="login-card__subtitle">使用授权账号进入配件仓工作台</div>
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
  background: #eef2f6;
}

.login-page::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(#dce3ec 1px, transparent 1px),
    linear-gradient(90deg, #dce3ec 1px, transparent 1px);
  background-size: 48px 48px;
  opacity: 0.42;
}

.login-page::after {
  content: none;
}

.login-shell {
  position: relative;
  z-index: 1;
  width: min(980px, 100%);
  min-height: 540px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.76fr);
  overflow: hidden;
  border: 1px solid #d5dde8;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 44px rgba(31, 45, 61, 0.14);
}

.login-panel {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 28px;
  padding: 44px;
  border-right: 1px solid #d8e0ea;
  background: #182235;
  color: #ffffff;
}

.login-panel__brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.login-panel__mark {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  background: #22324a;
  color: #dbeafe;
  font-weight: 800;
  letter-spacing: 0;
}

.login-panel__name {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
}

.login-panel__desc {
  margin-top: 6px;
  color: #aeb9c8;
  font-size: 13px;
}

.login-panel__summary {
  padding: 22px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: #202d40;
}

.login-panel__summary-title {
  margin-bottom: 16px;
  color: #d7dfeb;
  font-size: 13px;
  font-weight: 700;
}

.login-panel__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.login-panel__metric {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: #172132;
}

.login-panel__metric span,
.login-panel__metric strong {
  display: block;
}

.login-panel__metric span {
  color: #91a0b4;
  font-size: 12px;
}

.login-panel__metric strong {
  margin-top: 8px;
  color: #ffffff;
  font-size: 15px;
}

.login-panel__list {
  display: grid;
  gap: 10px;
}

.login-panel__list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.login-panel__list-row span {
  color: #cbd5e1;
  font-size: 13px;
}

.login-panel__list-row b {
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  text-align: right;
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
  font-size: 13px;
  font-weight: 700;
}

.login-card__title {
  margin: 10px 0 6px;
  color: #182235;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.3;
}

.login-card__subtitle {
  margin-bottom: 28px;
  color: #667085;
  font-size: 14px;
}

.login-submit {
  width: 100%;
  height: 42px;
  margin-top: 2px;
  border-radius: 6px;
  font-weight: 600;
  border: 1px solid #1f5fbf;
  background: #2563eb;
  box-shadow: none;
}

.login-submit:hover {
  border-color: #1d4ed8;
  background: #1d4ed8;
}

.login-submit:focus-visible {
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
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

  .login-panel {
    border-right: 0;
    border-bottom: 1px solid #e1e6ef;
    padding: 30px;
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

  .login-panel {
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
