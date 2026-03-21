<template>
  <div class="login-page">
    <div class="login-page__orb login-page__orb--left"></div>
    <div class="login-page__orb login-page__orb--right"></div>
    <div class="login-shell">
      <div class="login-hero">
        <div class="login-hero__badge">库存治理平台</div>
        <div class="login-hero__title">出入库管理</div>
        <div class="login-hero__subtitle">把台账、治理、演练和看板收拢到一套稳定的日常工作流里。</div>
        <div class="login-hero__grid">
          <div class="login-hero__item">
            <div class="login-hero__item-value">生命周期</div>
            <div class="login-hero__item-label">归档 / 恢复 / 清理闭环</div>
          </div>
          <div class="login-hero__item">
            <div class="login-hero__item-value">演练闭环</div>
            <div class="login-hero__item-label">问题跟踪、整改、复盘</div>
          </div>
          <div class="login-hero__item">
            <div class="login-hero__item-value">统一看板</div>
            <div class="login-hero__item-label">经营、治理、稳定性同屏</div>
          </div>
          <div class="login-hero__item">
            <div class="login-hero__item-value">可见范围</div>
            <div class="login-hero__item-label">部门 / 仓库 / 组合授权</div>
          </div>
        </div>
      </div>

      <el-card class="login-card" shadow="never">
        <div class="login-card__brand">欢迎登录</div>
        <div class="login-card__title">继续进入系统</div>
        <div class="login-card__desc">请输入账号和密码，进入你的工作台。</div>
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
      </el-card>
    </div>

    <el-dialog
      v-model="showChange"
      title="请修改初始密码"
      width="420px"
      :close-on-click-modal="false"
      :show-close="false"
    >
      <el-form>
        <el-form-item label="旧密码">
          <el-input v-model="oldP" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="newP" type="password" show-password autocomplete="new-password" />
          <div class="password-tip">密码长度需为 6-64 位，且必须同时包含字母和数字</div>
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
import { ElMessage } from "../utils/el-services";
import { loginWithCaptcha, useAuth, fetchMe } from "../store/auth";
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

async function renderTurnstile() {
  if (!siteKey || !requireCaptcha.value) return;
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
    await fetchMe();
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
    radial-gradient(circle at top left, rgba(64, 158, 255, 0.18), transparent 32%),
    radial-gradient(circle at bottom right, rgba(103, 194, 58, 0.12), transparent 24%),
    linear-gradient(135deg, #f3f7ff 0%, #f7f8fa 42%, #eef4ff 100%);
}

.login-page__orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(12px);
  pointer-events: none;
}

.login-page__orb--left {
  width: 260px;
  height: 260px;
  left: -80px;
  top: 120px;
  background: rgba(64, 158, 255, 0.15);
}

.login-page__orb--right {
  width: 220px;
  height: 220px;
  right: -70px;
  bottom: 90px;
  background: rgba(103, 194, 58, 0.12);
}

.login-shell {
  position: relative;
  z-index: 1;
  width: min(1120px, 100%);
  display: grid;
  grid-template-columns: 1.1fr minmax(360px, 420px);
  gap: 28px;
  align-items: stretch;
}

.login-hero {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px;
  border-radius: 28px;
  color: #1f2329;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(10px);
  box-shadow: 0 24px 80px rgba(31, 35, 41, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.7);
}

.login-hero__badge {
  display: inline-flex;
  width: fit-content;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(64, 158, 255, 0.12);
  color: #337ecc;
  font-size: 12px;
  font-weight: 600;
}

.login-hero__title {
  margin-top: 18px;
  font-size: 42px;
  line-height: 1.1;
  font-weight: 800;
}

.login-hero__subtitle {
  margin-top: 14px;
  max-width: 520px;
  font-size: 16px;
  line-height: 1.8;
  color: #5b6472;
}

.login-hero__grid {
  margin-top: 28px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.login-hero__item {
  padding: 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(220, 226, 234, 0.9);
}

.login-hero__item-value {
  font-size: 18px;
  font-weight: 700;
  color: #1f2329;
}

.login-hero__item-label {
  margin-top: 6px;
  font-size: 13px;
  color: #707782;
  line-height: 1.7;
}

.login-card {
  align-self: center;
  border-radius: 28px;
  border: none;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 28px 80px rgba(31, 35, 41, 0.12);
}

.login-card__brand {
  font-size: 13px;
  color: #337ecc;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.login-card__title {
  margin-top: 12px;
  font-size: 30px;
  font-weight: 800;
  color: #1f2329;
}

.login-card__desc {
  margin-top: 8px;
  margin-bottom: 22px;
  color: #7a818d;
  line-height: 1.7;
}

.login-submit {
  width: 100%;
  height: 44px;
  border-radius: 12px;
  font-weight: 700;
  margin-top: 4px;
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

:deep(.login-card .el-card__body) {
  padding: 30px 30px 26px;
}

:deep(.login-card .el-form-item__label) {
  font-weight: 600;
  color: #404552;
}

:deep(.login-card .el-input__wrapper) {
  min-height: 44px;
  border-radius: 12px;
  box-shadow: 0 0 0 1px rgba(31, 35, 41, 0.06) inset;
}

@media (max-width: 980px) {
  .login-shell {
    grid-template-columns: 1fr;
  }

  .login-hero {
    padding: 28px;
  }

  .login-hero__title {
    font-size: 34px;
  }
}

@media (max-width: 640px) {
  .login-page {
    padding: 18px;
  }

  .login-hero {
    display: none;
  }

  .login-shell {
    width: 100%;
    grid-template-columns: 1fr;
  }

  .login-card__title {
    font-size: 26px;
  }
}
</style>
