<template>
  <div class="login-page">
    <div class="login-shell">
      <section class="login-panel">
        <div class="login-panel__eyebrow">INVENTORY MANAGEMENT</div>
        <h1 class="login-panel__title">出入库管理系统</h1>
        <p class="login-panel__desc">
          使用系统账号登录，继续处理库存、台账、流转记录与系统维护任务。
        </p>

        <div class="login-panel__grid">
          <div class="login-panel__card">
            <div class="login-panel__card-title">支持范围</div>
            <div class="login-panel__card-text">配件仓、电脑仓、显示器仓与系统管理统一接入。</div>
          </div>
          <div class="login-panel__card">
            <div class="login-panel__card-title">账号安全</div>
            <div class="login-panel__card-text">首次登录请修改初始密码，触发安全校验时需完成验证码验证。</div>
          </div>
        </div>

        <div class="login-panel__notice">
          <div class="login-panel__notice-label">系统提示</div>
          <div class="login-panel__notice-text">{{ hitokotoText }}</div>
          <div v-if="hitokotoFrom" class="login-panel__notice-from">{{ hitokotoFrom }}</div>
        </div>
      </section>

      <el-card class="login-card" shadow="never">
        <div class="login-card__badge">账号登录</div>
        <div class="login-card__title">进入工作台</div>
        <div class="login-card__desc">请输入账号和密码，登录后将自动进入你有权限的工作区域。</div>

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
            {{ loading ? "登录中…" : "登录" }}
          </el-button>
        </el-form>

        <div class="login-card__footer">
          <span>首次登录请在进入系统后修改初始密码。</span>
        </div>
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
import { loginWithCaptcha, useAuth } from "../store/auth";
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
        callback: (t: string) => {
          turnstileToken.value = t;
        },
        "expired-callback": () => {
          turnstileToken.value = "";
        },
        "error-callback": () => {
          turnstileToken.value = "";
        },
      });
    } catch {}
  });
}

onBeforeUnmount(() => {
  const ts: any = (window as any).turnstile;
  if (ts && widgetId) {
    try {
      ts.remove(widgetId);
    } catch {}
  }
  widgetId = null;
});

const showChange = ref(false);
const oldP = ref("");
const newP = ref("");
const changing = ref(false);

const defaultHitokotoText = "请核对仓库范围、权限角色与当前任务，再开始今天的录入与盘点工作。";
const defaultHitokotoFrom = "系统提示";
const hitokotoText = ref(defaultHitokotoText);
const hitokotoFrom = ref(defaultHitokotoFrom);
const HITOKOTO_CACHE_TTL = 15 * 60 * 1000;

function applyHitokoto(text?: string, from?: string) {
  hitokotoText.value = String(text || "").trim() || defaultHitokotoText;
  hitokotoFrom.value = String(from || "").trim() || defaultHitokotoFrom;
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
  padding: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(180deg, #f7f8fa 0%, #f2f4f7 100%);
}

.login-shell {
  width: min(1120px, 100%);
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(360px, 420px);
  gap: 32px;
  align-items: stretch;
}

.login-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px;
  border-radius: 20px;
  background: #ffffff;
  border: 1px solid #e4e7ec;
  box-shadow: 0 12px 40px rgba(16, 24, 40, 0.06);
}

.login-panel__eyebrow {
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: #2f6bff;
}

.login-panel__title {
  margin: 14px 0 0;
  font-size: 38px;
  line-height: 1.15;
  font-weight: 700;
  color: #101828;
}

.login-panel__desc {
  margin: 16px 0 0;
  max-width: 560px;
  font-size: 15px;
  line-height: 1.8;
  color: #475467;
}

.login-panel__grid {
  margin-top: 28px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.login-panel__card {
  padding: 18px;
  border-radius: 14px;
  border: 1px solid #eaecf0;
  background: #fafbfc;
}

.login-panel__card-title {
  font-size: 14px;
  font-weight: 600;
  color: #101828;
}

.login-panel__card-text {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: #667085;
}

.login-panel__notice {
  margin-top: 28px;
  padding: 18px 20px;
  border-radius: 14px;
  border: 1px solid #eaecf0;
  background: #fcfcfd;
}

.login-panel__notice-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #475467;
}

.login-panel__notice-text {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.8;
  color: #344054;
}

.login-panel__notice-from {
  margin-top: 8px;
  font-size: 12px;
  color: #667085;
}

.login-card {
  border-radius: 20px;
  border: 1px solid #e4e7ec;
  background: #ffffff;
  box-shadow: 0 12px 40px rgba(16, 24, 40, 0.08);
}

.login-card__badge {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #2f6bff;
}

.login-card__title {
  margin-top: 12px;
  font-size: 28px;
  line-height: 1.25;
  font-weight: 700;
  color: #101828;
}

.login-card__desc {
  margin-top: 8px;
  margin-bottom: 22px;
  font-size: 14px;
  line-height: 1.7;
  color: #667085;
}

.login-submit {
  width: 100%;
  height: 44px;
  margin-top: 4px;
  border-radius: 10px;
  font-weight: 700;
}

.login-turnstile {
  margin: 10px 0 16px;
  display: flex;
  justify-content: center;
}

.login-turnstile__inner {
  min-height: 65px;
}

.login-card__footer {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #f2f4f7;
  font-size: 12px;
  line-height: 1.6;
  color: #667085;
}

.password-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #667085;
}

:deep(.login-card .el-card__body) {
  padding: 36px;
}

:deep(.login-card .el-form-item__label) {
  font-weight: 600;
  color: #344054;
}

:deep(.login-card .el-input__wrapper) {
  min-height: 44px;
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgba(16, 24, 40, 0.08) inset;
}

@media (max-width: 980px) {
  .login-shell {
    grid-template-columns: 1fr;
  }

  .login-panel,
  :deep(.login-card .el-card__body) {
    padding: 28px;
  }
}

@media (max-width: 640px) {
  .login-page {
    padding: 18px;
  }

  .login-panel {
    display: none;
  }

  .login-shell {
    width: 100%;
    grid-template-columns: 1fr;
  }

  .login-card__title {
    font-size: 24px;
  }
}
</style>
