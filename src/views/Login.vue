<template>
  <div class="login-page">
    <div class="login-page__orb login-page__orb--left"></div>
    <div class="login-page__orb login-page__orb--right"></div>
    <div class="login-shell">
      <div class="login-hero">
        <div class="login-hero__badge">欢迎回来</div>
        <div class="login-hero__title">让今天的工作，从一次顺畅登录开始</div>
        <div class="login-hero__quote">
          <div class="login-hero__quote-text">{{ hitokotoText }}</div>
          <div v-if="hitokotoFrom" class="login-hero__quote-from">—— {{ hitokotoFrom }}</div>
        </div>

        <div class="login-hero__visual" aria-hidden="true">
          <div class="login-hero__visual-glow"></div>
          <div class="login-hero__visual-card login-hero__visual-card--main">
            <div class="login-hero__visual-eyebrow">WELCOME</div>
            <div class="login-hero__visual-heading">欢迎进入系统</div>
            <div class="login-hero__visual-copy">登录后即可回到你的工作台，继续今天的安排。</div>
          </div>
          <div class="login-hero__visual-card login-hero__visual-card--side">
            <div class="login-hero__visual-dot"></div>
            <div>
              <div class="login-hero__visual-side-title">Hi</div>
              <div class="login-hero__visual-side-copy">愿今天一切顺利</div>
            </div>
          </div>
        </div>

        <div class="login-hero__note">请输入账号和密码继续访问系统。</div>
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
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "../utils/el-services";
import { loginWithCaptcha, useAuth, fetchMe } from "../store/auth";
import { firstAccessibleRoute } from "../utils/moduleAccess";
import { apiPost } from "../api/client";
import { validatePassword } from "../utils/password";
import { readHitokotoCache, writeHitokotoCache } from "../utils/hitokotoCache";

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

const defaultHitokotoText = "愿你今天录入顺利、盘点顺心，每一笔记录都清晰可查。";
const defaultHitokotoFrom = "欢迎回来";
const hitokotoText = ref(defaultHitokotoText);
const hitokotoFrom = ref(defaultHitokotoFrom);
const HITOKOTO_CACHE_TTL = 15 * 60 * 1000;

function applyHitokoto(text?: string, from?: string) {
  hitokotoText.value = String(text || '').trim() || defaultHitokotoText;
  hitokotoFrom.value = String(from || '').trim() || defaultHitokotoFrom;
}

async function loadHitokoto() {
  const cached = readHitokotoCache(HITOKOTO_CACHE_TTL);
  if (cached?.text) {
    applyHitokoto(cached.text, cached.from);
    if (cached.fresh) return;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch("https://v1.hitokoto.cn/?c=d&c=i&c=k&encode=json", {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const text = typeof data?.hitokoto === "string" ? data.hitokoto.trim() : "";
    const from = [data?.from_who, data?.from].filter(Boolean).join(" · ");
    if (text) {
      applyHitokoto(text, from || defaultHitokotoFrom);
      writeHitokotoCache({ text, from: from || defaultHitokotoFrom });
      return;
    }
    if (!cached?.text) applyHitokoto();
  } catch {
    if (!cached?.text) applyHitokoto();
  } finally {
    window.clearTimeout(timer);
  }
}

onMounted(() => {
  void loadHitokoto();
});

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
  width: min(1140px, 100%);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px;
  align-items: stretch;
}

.login-hero {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 580px;
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
  max-width: 560px;
  font-size: 42px;
  line-height: 1.15;
  font-weight: 800;
}

.login-hero__quote {
  margin-top: 18px;
  max-width: 560px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(214, 225, 240, 0.95);
  box-shadow: 0 10px 24px rgba(31, 35, 41, 0.04);
}

.login-hero__quote-text {
  font-size: 16px;
  line-height: 1.9;
  color: #4b5563;
}

.login-hero__quote-from {
  margin-top: 8px;
  font-size: 13px;
  color: #7b8794;
}

.login-hero__visual {
  position: relative;
  margin-top: 32px;
  min-height: 250px;
  border-radius: 26px;
  overflow: hidden;
  background:
    linear-gradient(145deg, rgba(64, 158, 255, 0.16), rgba(64, 158, 255, 0.04)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(245, 249, 255, 0.92));
  border: 1px solid rgba(214, 225, 240, 0.92);
}

.login-hero__visual-glow {
  position: absolute;
  width: 220px;
  height: 220px;
  right: -30px;
  top: -50px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(64, 158, 255, 0.28), rgba(64, 158, 255, 0));
}

.login-hero__visual-card {
  position: absolute;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 40px rgba(31, 35, 41, 0.08);
  border: 1px solid rgba(224, 232, 241, 0.92);
}

.login-hero__visual-card--main {
  left: 28px;
  top: 34px;
  width: min(440px, calc(100% - 56px));
  padding: 26px 28px;
}

.login-hero__visual-card--side {
  right: 26px;
  bottom: 26px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}

.login-hero__visual-eyebrow {
  font-size: 12px;
  letter-spacing: 0.16em;
  color: #7f8a99;
  font-weight: 700;
}

.login-hero__visual-heading {
  margin-top: 10px;
  font-size: 28px;
  line-height: 1.2;
  font-weight: 800;
  color: #1f2329;
}

.login-hero__visual-copy {
  margin-top: 10px;
  max-width: 320px;
  font-size: 14px;
  line-height: 1.8;
  color: #66707f;
}

.login-hero__visual-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #409eff, #7bc4ff);
  box-shadow: 0 0 0 6px rgba(64, 158, 255, 0.14);
}

.login-hero__visual-side-title {
  font-size: 16px;
  font-weight: 700;
  color: #1f2329;
}

.login-hero__visual-side-copy {
  margin-top: 3px;
  font-size: 13px;
  color: #707782;
}

.login-hero__note {
  margin-top: 18px;
  font-size: 14px;
  line-height: 1.8;
  color: #6c7684;
}

.login-card {
  min-height: 580px;
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
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px;
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

  .login-hero,
  .login-card {
    min-height: auto;
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
