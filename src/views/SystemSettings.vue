<template>
  <div class="settings-page">
    <el-card class="settings-card">
      <template #header>
        <div class="settings-header">
          <div>
            <div class="settings-title">系统配置</div>
            <div class="settings-subtitle">把常用默认规则、基础字典和归档策略收进这里，修改后即时影响台账与扫码体验。</div>
          </div>
          <div class="settings-actions">
            <el-button @click="reload" :loading="loading">刷新</el-button>
            <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
          </div>
        </div>
      </template>

      <el-alert type="info" :closable="false" show-icon title="建议先在测试环境调整，再发布到正式环境。字典项按一行一个填写，保存后会直接影响筛选和归档弹窗。" />

      <div class="settings-summary">
        <div class="summary-item">
          <div class="summary-label">默认分页</div>
          <div class="summary-value">{{ form.ui_default_page_size }}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">物理删除</div>
          <div class="summary-value">{{ form.asset_allow_physical_delete ? '允许' : '优先归档' }}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">归档原因</div>
          <div class="summary-value">{{ archiveReasonTextList.length }}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">部门字典</div>
          <div class="summary-value">{{ departmentTextList.length }}</div>
        </div>
      </div>

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
            <template #header><div class="section-title">归档策略</div></template>
            <el-form label-width="160px">
              <el-form-item label="允许物理删除">
                <el-switch v-model="form.asset_allow_physical_delete" />
                <div class="form-tip">关闭后，删除资产将优先转为归档，更适合正式环境保留追溯链路。</div>
              </el-form-item>
              <el-form-item label="归档原因字典">
                <el-input v-model="archiveReasonsText" type="textarea" :rows="6" placeholder="一行一个归档原因" />
                <div class="form-tip">会用于台账归档原因筛选和批量归档弹窗。</div>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
        <el-col :xs="24" :lg="12">
          <el-card shadow="never" class="section-card">
            <template #header><div class="section-title">基础数据字典</div></template>
            <el-form label-width="120px">
              <el-form-item label="部门字典">
                <el-input v-model="departmentsText" type="textarea" :rows="6" placeholder="一行一个部门" />
                <div class="form-tip">用于批量修改领用人的部门下拉，仍允许临时录入新值。</div>
              </el-form-item>
              <el-form-item label="电脑品牌">
                <el-input v-model="pcBrandsText" type="textarea" :rows="5" placeholder="一行一个电脑品牌" />
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
              <el-form-item label="默认连续扫码方式">
                <el-segmented v-model="form.public_inventory_scan_mode_default" :options="scanModeOptions" class="scan-mode-setting" />
                <div class="form-tip">可选手动、扫码枪或摄像头连续扫码。摄像头模式更适合手机现场盘点。</div>
              </el-form-item>
              <el-form-item label="显示器品牌">
                <el-input v-model="monitorBrandsText" type="textarea" :rows="5" placeholder="一行一个显示器品牌" />
                <div class="form-tip">用于显示器台账新增 / 编辑时的品牌下拉建议。</div>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { DEFAULT_SYSTEM_SETTINGS, fetchSystemSettings, saveSystemSettings, type SystemSettings } from '../api/systemSettings';

const loading = ref(false);
const saving = ref(false);
const form = ref<SystemSettings>({ ...DEFAULT_SYSTEM_SETTINGS });
const scanModeOptions = [
  { label: '手动', value: 'manual' },
  { label: '扫码枪', value: 'scanner' },
  { label: '摄像头', value: 'camera' },
];

function parseLines(value: string) {
  return String(value || '').split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

const archiveReasonsText = computed({
  get: () => (form.value.asset_archive_reason_options || []).join('\n'),
  set: (value: string) => { form.value.asset_archive_reason_options = parseLines(value); },
});
const departmentsText = computed({
  get: () => (form.value.dictionary_department_options || []).join('\n'),
  set: (value: string) => { form.value.dictionary_department_options = parseLines(value); },
});
const pcBrandsText = computed({
  get: () => (form.value.dictionary_pc_brand_options || []).join('\n'),
  set: (value: string) => { form.value.dictionary_pc_brand_options = parseLines(value); },
});
const monitorBrandsText = computed({
  get: () => (form.value.dictionary_monitor_brand_options || []).join('\n'),
  set: (value: string) => { form.value.dictionary_monitor_brand_options = parseLines(value); },
});

const archiveReasonTextList = computed(() => form.value.asset_archive_reason_options || []);
const departmentTextList = computed(() => form.value.dictionary_department_options || []);

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
.settings-page{max-width:1180px;margin:0 auto}
.settings-card,.section-card{border-radius:16px}
.settings-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.settings-title{font-weight:800;font-size:18px}
.settings-subtitle{color:#777;font-size:13px;margin-top:4px}
.settings-actions{display:flex;gap:10px;flex-wrap:wrap}
.settings-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:14px 0 4px}
.summary-item{padding:14px 16px;border:1px solid #ebeef5;border-radius:14px;background:linear-gradient(180deg,#fff 0%,#fafcff 100%)}
.summary-label{font-size:12px;color:#909399;margin-bottom:6px}
.summary-value{font-size:20px;font-weight:800;color:#303133}
.settings-grid{margin-top:14px}
.section-title{font-weight:700}
.form-tip{margin-top:6px;color:#8a8a8a;font-size:12px;line-height:1.5}
.scan-mode-setting{max-width:320px}
</style>
