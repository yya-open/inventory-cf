<template>
  <div class="settings-page">
    <el-card class="settings-card">
      <template #header>
        <div class="settings-header">
          <div>
            <div class="settings-title">系统配置</div>
            <div class="settings-subtitle">把常用默认规则收进这里，修改后即时影响扫码与部分前端默认行为。</div>
          </div>
          <div class="settings-actions">
            <el-button @click="reload" :loading="loading">刷新</el-button>
            <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
          </div>
        </div>
      </template>

      <el-alert type="info" :closable="false" show-icon title="建议先在测试环境调整，再发布到正式环境。扫码页面会优先读取这里的配置。" />

      <el-row :gutter="14" class="settings-grid">
        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="section-card">
            <template #header><div class="section-title">通用前端默认值</div></template>
            <el-form label-width="140px">
              <el-form-item label="默认每页条数">
                <el-input-number v-model="form.ui_default_page_size" :min="10" :max="200" :step="10" />
                <div class="form-tip">台账页未记住个人页大小时，会使用这里的默认值。</div>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="section-card">
            <template #header><div class="section-title">扫码与现场盘点体验</div></template>
            <el-form label-width="170px">
              <el-form-item label="扫码提交冷却秒数">
                <el-input-number v-model="form.public_inventory_cooldown_seconds" :min="5" :max="120" />
                <div class="form-tip">现场连续扫码时，防止同一项被短时间重复提交。</div>
              </el-form-item>
              <el-form-item label="扫码成功自动震动">
                <el-switch v-model="form.public_inventory_auto_vibrate" />
              </el-form-item>
              <el-form-item label="默认连续盘点模式">
                <el-switch v-model="form.public_inventory_continuous_mode_default" />
              </el-form-item>
              <el-form-item label="默认移动端紧凑布局">
                <el-switch v-model="form.public_inventory_mobile_compact" />
              </el-form-item>
              <el-form-item label="弱网重试提示">
                <el-switch v-model="form.public_inventory_retry_hint" />
              </el-form-item>
              <el-form-item label="默认扫码枪模式">
                <el-switch v-model="form.public_inventory_scanner_mode_default" />
                <div class="form-tip">开启后，连续盘点输入框会自动聚焦并在识别到完整二维码链接或 token 后自动跳转下一项。</div>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { DEFAULT_SYSTEM_SETTINGS, fetchSystemSettings, saveSystemSettings, type SystemSettings } from '../api/systemSettings';

const loading = ref(false);
const saving = ref(false);
const form = ref<SystemSettings>({ ...DEFAULT_SYSTEM_SETTINGS });

async function reload() {
  loading.value = true;
  try {
    form.value = await fetchSystemSettings();
  } catch (e: any) {
    ElMessage.error(e?.message || '加载配置失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    form.value = await saveSystemSettings(form.value);
    ElMessage.success('配置已保存');
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.settings-page{max-width:1100px;margin:0 auto}
.settings-card,.section-card{border-radius:16px}
.settings-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.settings-title{font-weight:800;font-size:18px}
.settings-subtitle{color:#777;font-size:13px;margin-top:4px}
.settings-actions{display:flex;gap:10px;flex-wrap:wrap}
.settings-grid{margin-top:14px}
.section-title{font-weight:700}
.form-tip{margin-top:6px;color:#8a8a8a;font-size:12px;line-height:1.5}
</style>
