<template>
  <div style="height:100vh; display:flex; align-items:center; justify-content:center; background:#f7f8fa">
    <el-card style="width: 420px">
      <div style="font-size:18px; font-weight:700; margin-bottom:16px">登录</div>
      <el-form @submit.prevent label-position="top">
        <el-form-item label="账号">
          <el-input v-model="username" placeholder="请输入账号" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="password" type="password" show-password placeholder="请输入密码" />
        </el-form-item>

        <div v-if="siteKey && requireCaptcha" style="margin: 10px 0 16px; display:flex; justify-content:center">
          <div
            :key="captchaKey"
            class="cf-turnstile"
            :data-sitekey="siteKey"
            data-callback="turnstileCallback"
          ></div>
        </div>
        <el-button type="primary" style="width:100%" :loading="loading" @click="doLogin">登录</el-button>
      </el-form>
    </el-card>

    <el-dialog v-model="showChange" title="请修改初始密码" width="420px" :close-on-click-modal="false" :show-close="false">
      <el-form>
        <el-form-item label="旧密码">
          <el-input v-model="oldP" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="newP" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" :loading="changing" @click="changePassword">确认修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { loginWithCaptcha, useAuth, fetchMe } from "../store/auth";
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
const captchaKey = ref(0);

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
    // 登录后默认进入“配件仓”
    const redirect = (route.query.redirect as string) || "/stock";
    router.replace(redirect);
  } catch (e: any) {
    if (e?.require_captcha) {
      requireCaptcha.value = true;
      turnstileToken.value = "";
      captchaKey.value++;
      if (!siteKey) {
        ElMessage.error("需要验证码登录，但未配置 VITE_TURNSTILE_SITEKEY");
      } else {
        ElMessage.warning("请先完成验证码验证");
      }
      return;
    }
    ElMessage.error(e.message || "登录失败");
  } finally {
    loading.value = false;
  }
}

async function changePassword() {
  const vp = validatePassword(newP.value);
  if (!vp.ok) return ElMessage.warning(vp.msg.replace(/^密码/, "新密码"));
  changing.value = true;
  try {
    await apiPost<any>("/api/auth/change-password", { old_password: oldP.value, new_password: newP.value });
    showChange.value = false;
    ElMessage.success("密码已更新，请重新登录");
    auth.token = "";
    localStorage.removeItem("token");
    router.replace("/login");
  } catch (e: any) {
    ElMessage.error(e.message || "修改失败");
  } finally {
    changing.value = false;
  }
}

onMounted(() => {
  // Turnstile callback must be global (referenced by data-callback attr)
  (window as any).turnstileCallback = (token: string) => {
    turnstileToken.value = token || "";
  };
});
</script>
