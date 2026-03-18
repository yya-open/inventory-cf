<template>
  <div :class="['public-wrap', settings.public_inventory_mobile_compact ? 'public-mobile-compact' : '', 'public-mobile-page']">
    <el-card class="public-card" shadow="always">
      <template #header>
        <div class="public-header-row">
          <div class="public-card-title">
            显示器信息
            <div class="public-card-subtitle">扫码即可查看实时信息，适合现场盘点和快速复核。</div>
          </div>
          <el-tag v-if="row" :type="statusTagType(row.status)">{{ statusText(row.status) }}</el-tag>
        </div>
      </template>

      <el-alert
        v-if="settings.public_inventory_retry_hint && (retryMessage || weakNetworkHint)"
        class="public-alert"
        :title="retryMessage || weakNetworkHint"
        :type="retryMessage ? 'warning' : 'info'"
        show-icon
        :closable="false"
      >
        <template #default>
          <div class="alert-actions">
            <el-button size="small" @click="retryLast">重试</el-button>
            <el-button v-if="retryMessage" size="small" text @click="clearRetry">关闭提示</el-button>
          </div>
        </template>
      </el-alert>

      <el-card shadow="never" class="public-next-card">
        <div class="public-next-head">
          <div>
            <div class="next-title">连续盘点</div>
            <div class="next-subtitle">提交当前结果后，可直接在本页切到下一项，减少来回跳转。</div>
          </div>
          <el-switch v-model="continuousMode" active-text="连续模式" />
        </div>
        <div class="public-next-body">
          <el-input
            v-model="nextInput"
            size="large"
            clearable
            inputmode="search"
            placeholder="粘贴下一项二维码链接或 token，回车即可切换"
            @keydown.enter.prevent="goNextFromInput"
          />
          <el-button size="large" type="primary" plain @click="goNextFromInput">前往下一项</el-button>
        </div>
        <div v-if="recentTargets.length" class="recent-row">
          <span class="recent-label">最近扫码：</span>
          <el-button v-for="item in recentTargets" :key="item" size="small" text @click="openRecent(item)">{{ recentLabel(item) }}</el-button>
        </div>
      </el-card>

      <div v-if="loading" style="padding:18px 0"><el-skeleton :rows="6" animated /></div>
      <el-alert v-else-if="error" :title="error" type="error" show-icon>
        <template #default><div class="alert-actions"><el-button size="small" @click="refresh">重试加载</el-button></div></template>
      </el-alert>

      <el-descriptions v-else :column="descColumns" border>
        <el-descriptions-item label="资产编号">{{ row?.asset_code || '-' }}</el-descriptions-item>
        <el-descriptions-item label="SN">{{ row?.sn || '-' }}</el-descriptions-item>
        <el-descriptions-item label="品牌">{{ row?.brand || '-' }}</el-descriptions-item>
        <el-descriptions-item label="型号">{{ row?.model || '-' }}</el-descriptions-item>
        <el-descriptions-item label="尺寸">{{ row?.size_inch || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusText(row?.status) }}</el-descriptions-item>
        <el-descriptions-item label="位置" :span="2">{{ locationText(row) }}</el-descriptions-item>
        <el-descriptions-item label="当前领用人" :span="2">
          <div v-if="row?.status==='ASSIGNED'">
            <div style="font-weight:600">{{ row?.employee_name || '-' }}</div>
            <div style="color:#999;font-size:12px">{{ row?.employee_no || '-' }} · {{ row?.department || '-' }}</div>
          </div>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2"><div style="white-space:pre-wrap">{{ row?.remark || '-' }}</div></el-descriptions-item>
      </el-descriptions>

      <div v-if="!loading && !error" class="public-actions public-actions-sticky">
        <el-button size="large" type="success" :loading="submittingOk" :disabled="cooldownLeft > 0" @click="submitOk">盘点通过（在位）</el-button>
        <el-button size="large" type="warning" plain :disabled="cooldownLeft > 0" @click="issueVisible=true">报异常</el-button>
        <el-button size="large" type="primary" plain :disabled="cooldownLeft > 0" @click="refresh">刷新</el-button>
        <div v-if="cooldownLeft > 0" class="cooldown">已记录，{{ cooldownLeft }}s 后可再次提交</div>
      </div>
    </el-card>

    <el-dialog v-model="issueVisible" title="报异常" width="520px" destroy-on-close class="public-issue-dialog">
      <el-form :model="issueForm" label-width="86px">
        <el-form-item label="异常类型" required>
          <el-segmented v-if="isMobile" v-model="issueForm.issue_type" :options="issueSegmentOptions" class="issue-segmented" />
          <el-select v-else v-model="issueForm.issue_type" placeholder="请选择" style="width:100%">
            <el-option v-for="item in issueOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="issueForm.remark" type="textarea" :autosize="{ minRows: 3, maxRows: 5 }" placeholder="可选：补充说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="large" @click="issueVisible=false">取消</el-button>
        <el-button size="large" type="primary" :loading="submittingIssue" :disabled="cooldownLeft > 0" @click="submitIssue">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { apiGetPublic, apiPostPublic } from '../api/client';
import { DEFAULT_SYSTEM_SETTINGS, fetchPublicSettings, type SystemSettings } from '../api/systemSettings';
import { buildPublicQuery, getWeakNetworkText, isNetworkError, loadRecentPublicTargets, parsePublicTargetInput, saveRecentPublicTarget, triggerSuccessVibration } from '../utils/publicInventory';

const issueOptions = [
  { label: '不在位', value: 'NOT_FOUND' },
  { label: '位置不对', value: 'WRONG_LOCATION' },
  { label: '贴错码', value: 'WRONG_QR' },
  { label: '状态不对', value: 'WRONG_STATUS' },
  { label: '疑似丢失', value: 'MISSING' },
  { label: '其他', value: 'OTHER' },
];
const issueSegmentOptions = issueOptions.map((item) => ({ label: item.label, value: item.value }));

const settings = ref<SystemSettings>({ ...DEFAULT_SYSTEM_SETTINGS });
const loading = ref(true);
const error = ref('');
const row = ref<any>(null);
const id = ref('');
const key = ref('');
const token = ref('');
const submittingOk = ref(false);
const submittingIssue = ref(false);
const issueVisible = ref(false);
const issueForm = ref({ issue_type: '', remark: '' });
const cooldownLeft = ref(0);
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280);
const descColumns = computed(() => (viewportWidth.value < 640 ? 1 : 2));
const isMobile = computed(() => viewportWidth.value < 640);
const continuousMode = ref(true);
const nextInput = ref('');
const recentTargets = ref<string[]>([]);
const weakNetworkHint = ref('');
const retryMessage = ref('');
const retryAction = ref<null | 'refresh' | 'ok' | 'issue'>(null);
let cooldownTimer: any = null;

function handleResize() { viewportWidth.value = window.innerWidth; }
function handleNetworkChange() { weakNetworkHint.value = settings.value.public_inventory_retry_hint ? getWeakNetworkText() : ''; }
function recentLabel(item: string) {
  const q = new URLSearchParams(item);
  return q.get('id') || q.get('token')?.slice(0, 12) || item.slice(0, 14);
}
function clearRetry() { retryMessage.value = ''; retryAction.value = null; }
function locationText(r: any) { return [r?.parent_location_name, r?.location_name].filter(Boolean).join('/') || '-'; }

function startCooldown(seconds = settings.value.public_inventory_cooldown_seconds) {
  cooldownLeft.value = seconds;
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    cooldownLeft.value = Math.max(0, cooldownLeft.value - 1);
    if (cooldownLeft.value <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }, 1000);
}

function statusText(s: string) {
  if (s === 'IN_STOCK') return '在库';
  if (s === 'ASSIGNED') return '已领用';
  if (s === 'RECYCLED') return '已回收';
  if (s === 'SCRAPPED') return '已报废';
  return s || '-';
}
function statusTagType(s: string) {
  if (s === 'IN_STOCK') return 'success';
  if (s === 'ASSIGNED') return 'warning';
  if (s === 'RECYCLED') return 'info';
  if (s === 'SCRAPPED') return 'danger';
  return 'info';
}

function syncFromLocation() {
  const url = new URL(window.location.href);
  id.value = (url.searchParams.get('id') || '').trim();
  key.value = (url.searchParams.get('key') || '').trim();
  token.value = (url.searchParams.get('token') || '').trim();
}

function openRecent(item: string) {
  const target = parsePublicTargetInput(`?${item}`);
  if (!target) return;
  const url = new URL(window.location.href);
  url.search = buildPublicQuery(target);
  window.history.replaceState({}, '', url.toString());
  nextInput.value = '';
  refresh();
}
function goNextFromInput() {
  const target = parsePublicTargetInput(nextInput.value);
  if (!target) return ElMessage.warning('请先粘贴下一项二维码链接或 token');
  const url = new URL(window.location.href);
  url.search = buildPublicQuery(target);
  window.history.replaceState({}, '', url.toString());
  nextInput.value = '';
  refresh();
}

async function loadPublicConfig() {
  try {
    settings.value = await fetchPublicSettings();
    continuousMode.value = settings.value.public_inventory_continuous_mode_default;
  } catch {}
  handleNetworkChange();
}

async function refresh() {
  loading.value = true;
  error.value = '';
  clearRetry();
  try {
    syncFromLocation();
    let apiUrl = '';
    if (id.value && key.value) apiUrl = `/api/public/monitor-asset?id=${encodeURIComponent(id.value)}&key=${encodeURIComponent(key.value)}`;
    else if (token.value) apiUrl = `/api/public/monitor-asset?token=${encodeURIComponent(token.value)}`;
    else throw new Error('缺少二维码参数');
    const j: any = await apiGetPublic(apiUrl);
    row.value = j.data;
    saveRecentPublicTarget('monitor', token.value ? { token: token.value } : { id: id.value, key: key.value });
    recentTargets.value = loadRecentPublicTargets('monitor');
  } catch (e: any) {
    error.value = e?.message || '获取失败';
    if (isNetworkError(e)) {
      retryMessage.value = '网络请求失败，请检查网络后重试。';
      retryAction.value = 'refresh';
    }
  } finally { loading.value = false; }
}

function inventoryApiUrl() {
  if (id.value && key.value) return `/api/public/monitor-asset-inventory?id=${encodeURIComponent(id.value)}&key=${encodeURIComponent(key.value)}`;
  if (token.value) return `/api/public/monitor-asset-inventory?token=${encodeURIComponent(token.value)}`;
  return '';
}

async function onSubmitSuccess(message: string) {
  ElMessage.success(message);
  triggerSuccessVibration(settings.value.public_inventory_auto_vibrate);
  startCooldown(settings.value.public_inventory_cooldown_seconds);
  if (continuousMode.value && nextInput.value.trim()) setTimeout(() => goNextFromInput(), 160);
}

async function submitOk() {
  try {
    clearRetry();
    const apiUrl = inventoryApiUrl();
    if (!apiUrl) throw new Error('缺少二维码参数');
    submittingOk.value = true;
    await apiPostPublic(apiUrl, { action: 'OK' });
    await onSubmitSuccess('已记录：盘点通过');
  } catch (e: any) {
    if (isNetworkError(e)) {
      retryMessage.value = '网络较弱，盘点结果暂未提交成功，可点击重试。';
      retryAction.value = 'ok';
    }
    ElMessage.error(e?.message || '提交失败');
  } finally { submittingOk.value = false; }
}

async function submitIssue() {
  try {
    clearRetry();
    const apiUrl = inventoryApiUrl();
    if (!apiUrl) throw new Error('缺少二维码参数');
    if (!issueForm.value.issue_type) throw new Error('请选择异常类型');
    submittingIssue.value = true;
    await apiPostPublic(apiUrl, { action: 'ISSUE', issue_type: issueForm.value.issue_type, remark: issueForm.value.remark });
    issueVisible.value = false;
    issueForm.value = { issue_type: '', remark: '' };
    await onSubmitSuccess('已提交：异常');
  } catch (e: any) {
    if (isNetworkError(e)) {
      retryMessage.value = '网络较弱，异常结果暂未提交成功，可点击重试。';
      retryAction.value = 'issue';
    }
    ElMessage.error(e?.message || '提交失败');
  } finally { submittingIssue.value = false; }
}

function retryLast() {
  if (retryAction.value === 'ok') return submitOk();
  if (retryAction.value === 'issue') return submitIssue();
  return refresh();
}

watch(() => settings.value.public_inventory_retry_hint, handleNetworkChange);

onMounted(async () => {
  await loadPublicConfig();
  recentTargets.value = loadRecentPublicTargets('monitor');
  await refresh();
  window.addEventListener('resize', handleResize);
  window.addEventListener('online', handleNetworkChange);
  window.addEventListener('offline', handleNetworkChange);
});

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('online', handleNetworkChange);
  window.removeEventListener('offline', handleNetworkChange);
});
</script>

<style scoped>
.public-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:22px 12px;background:radial-gradient(1200px 600px at 20% 0%, rgba(66,133,244,0.12), transparent 60%),radial-gradient(1200px 600px at 80% 0%, rgba(52,199,89,0.10), transparent 60%),linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.00))}
.public-card{width:min(980px,100%);border-radius:18px}
.public-header-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.public-card-title{font-weight:800;font-size:18px}.public-card-subtitle{font-size:12px;color:#7e7e7e;font-weight:500;margin-top:4px}
.public-alert{margin-bottom:12px}.alert-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.public-next-card{margin-bottom:14px;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(246,248,250,.98))}
.public-next-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.next-title{font-weight:700}.next-subtitle{font-size:12px;color:#7a7a7a;margin-top:4px}
.public-next-body{display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap}.recent-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}.recent-label{font-size:12px;color:#8a8a8a}
.public-actions{display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap}.cooldown{color:#999;font-size:12px}
:deep(.el-descriptions__label){width:120px;color:#666}:deep(.el-descriptions__content){color:#333}.issue-segmented{width:100%}
.public-mobile-compact :deep(.el-button){border-radius:12px}
@media (max-width:640px){.public-wrap{padding:12px 8px;align-items:stretch}.public-card{width:100%;border-radius:16px}.public-header-row{align-items:flex-start}.public-actions{position:sticky;bottom:0;padding-top:12px;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.92) 35%,rgba(255,255,255,.98));z-index:5}.public-actions :deep(.el-button){flex:1 1 calc(50% - 6px);min-height:46px}.public-next-body{flex-direction:column;align-items:stretch}.public-next-body :deep(.el-button){width:100%}:deep(.el-descriptions__label){width:98px}}
</style>
