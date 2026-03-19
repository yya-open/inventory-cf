<template>
  <div :class="['public-wrap', settings.public_inventory_mobile_compact ? 'public-mobile-compact' : '', 'public-mobile-page']">
    <el-card class="public-card" shadow="always">
      <template #header>
        <div class="public-header-row">
          <div class="public-card-title">
            电脑信息
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
          <div class="public-next-switches">
            <el-switch v-model="continuousMode" active-text="连续模式" />
            <el-segmented v-model="scanMode" :options="scanModeOptions" class="scan-mode-switch" />
          </div>
        </div>
        <div v-if="scanMode === 'camera'" class="camera-panel">
          <div class="camera-frame">
            <video ref="cameraVideoRef" class="camera-video" autoplay playsinline muted />
            <div class="camera-overlay"></div>
          </div>
          <div class="camera-actions">
            <el-button size="large" type="primary" :loading="cameraStarting" @click="toggleCamera">{{ cameraActive ? '停止摄像头' : '启动摄像头' }}</el-button>
            <el-button v-if="cameraError" size="large" plain @click="retryCamera">重试开启</el-button>
          </div>
          <div v-if="cameraError" class="camera-error">{{ cameraError }}</div>
        </div>
        <div class="public-next-body">
          <el-input
            ref="nextInputRef"
            v-model="nextInput"
            size="large"
            clearable
            inputmode="search"
            :placeholder="nextInputPlaceholder"
            @keydown.enter.prevent="goNextFromInput"
          />
          <el-button size="large" type="primary" plain @click="goNextFromInput">处理下一项</el-button>
        </div>
        <div class="scanner-tip">{{ scannerTip }}</div>
        <div v-if="recentTargets.length" class="recent-row">
          <span class="recent-label">最近扫码：</span>
          <el-button v-for="item in recentTargets" :key="item" size="small" text @click="openRecent(item)">{{ recentLabel(item) }}</el-button>
        </div>
      </el-card>

      <div v-if="loading" style="padding:18px 0">
        <el-skeleton :rows="6" animated />
      </div>
      <el-alert v-else-if="error" :title="error" type="error" show-icon>
        <template #default>
          <div class="alert-actions"><el-button size="small" @click="refresh">重试加载</el-button></div>
        </template>
      </el-alert>

      <el-descriptions v-else :column="descColumns" border>
        <el-descriptions-item label="品牌">{{ row?.brand || '-' }}</el-descriptions-item>
        <el-descriptions-item label="型号">{{ row?.model || '-' }}</el-descriptions-item>
        <el-descriptions-item label="序列号">{{ row?.serial_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusText(row?.status) }}</el-descriptions-item>
        <el-descriptions-item label="出厂日期">{{ row?.manufacture_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="保修到期">{{ row?.warranty_end || '-' }}</el-descriptions-item>
        <el-descriptions-item label="硬盘容量">{{ row?.disk_capacity || '-' }}</el-descriptions-item>
        <el-descriptions-item label="内存大小">{{ row?.memory_size || '-' }}</el-descriptions-item>
        <el-descriptions-item label="配置日期">{{ row?.last_config_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="回收日期">{{ row?.last_recycle_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="当前领用人" :span="2">
          <div v-if="row?.status==='ASSIGNED'">
            <div style="font-weight:600">{{ row?.last_employee_name || '-' }}</div>
            <div style="color:#999;font-size:12px">{{ row?.last_employee_no || '-' }} · {{ row?.last_department || '-' }}</div>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { apiGetPublic, apiPostPublic } from '../api/client';
import { DEFAULT_SYSTEM_SETTINGS, fetchPublicSettings, type PublicScanMode, type SystemSettings } from '../api/systemSettings';
import { buildPublicQuery, getWeakNetworkText, isNetworkError, loadRecentPublicTargets, parsePublicTargetInput, saveRecentPublicTarget, triggerSuccessVibration } from '../utils/publicInventory';
import { useCameraQrScanner } from '../composables/useCameraQrScanner';

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
const scanMode = ref<PublicScanMode>('scanner');
const nextInput = ref('');
const nextInputRef = ref<any>(null);
const cameraVideoRef = ref<HTMLVideoElement | null>(null);
const recentTargets = ref<string[]>([]);
const weakNetworkHint = ref('');
const retryMessage = ref('');
const retryAction = ref<null | 'refresh' | 'ok' | 'issue'>(null);
const scanModeOptions = computed(() => ([
  { label: '手动', value: 'manual' },
  { label: '扫码枪', value: 'scanner' },
  { label: '摄像头', value: 'camera', disabled: !cameraSupported.value },
]));
const nextInputPlaceholder = computed(() => scanMode.value === 'camera' ? '摄像头模式下，也可手动粘贴下一项二维码链接 / token' : '粘贴或扫描下一项二维码链接 / token，扫码枪回车可直接切换');
const scannerTip = computed(() => {
  if (scanMode.value === 'camera') {
    if (!cameraSupported.value) return '当前浏览器不支持摄像头连续扫码，请切换为扫码枪模式。';
    if (cameraError.value) return cameraError.value;
    return cameraActive.value ? '摄像头扫码中：对准下一项二维码后会自动切到下一项。' : '摄像头模式已选择：点击“启动摄像头”后即可连续识别二维码。';
  }
  if (scanMode.value === 'scanner') return '扫码枪模式已开启：输入框会自动保持焦点，识别到完整二维码链接或 token 后会自动切换。';
  return '手动模式：可粘贴二维码链接或 token 后按回车或点击按钮切换。';
});
let cooldownTimer: any = null;
let scannerTimer: any = null;

function handleResize() { viewportWidth.value = window.innerWidth; }
function handleNetworkChange() { weakNetworkHint.value = settings.value.public_inventory_retry_hint ? getWeakNetworkText() : ''; }
function recentLabel(item: string) {
  const q = new URLSearchParams(item);
  return q.get('id') || q.get('token')?.slice(0, 12) || item.slice(0, 14);
}
function clearRetry() { retryMessage.value = ''; retryAction.value = null; }
const {
  supported: cameraSupported,
  active: cameraActive,
  starting: cameraStarting,
  error: cameraError,
  start: startCamera,
  stop: stopCamera,
  clearError: clearCameraError,
} = useCameraQrScanner(cameraVideoRef, (raw) => {
  if (!continuousMode.value || scanMode.value !== 'camera') return;
  const target = parsePublicTargetInput(raw);
  if (!target) return;
  goNextToTarget(target, 'camera');
});

async function toggleCamera() {
  if (cameraActive.value) stopCamera();
  else await startCamera();
}

async function retryCamera() {
  clearCameraError();
  await startCamera();
}


function focusNextInput() {
  nextTick(() => {
    const target = nextInputRef.value;
    if (target && typeof target.focus === 'function') target.focus();
  });
}

function scheduleScannerAutoGo() {
  if (!continuousMode.value || scanMode.value !== 'scanner') return;
  const target = parsePublicTargetInput(nextInput.value);
  if (!target) return;
  if (scannerTimer) clearTimeout(scannerTimer);
  scannerTimer = setTimeout(() => {
    if (continuousMode.value && scanMode.value === 'scanner' && parsePublicTargetInput(nextInput.value)) {
      goNextFromInput();
    }
  }, 90);
}

function startCooldown(seconds = settings.value.public_inventory_cooldown_seconds) {
  cooldownLeft.value = seconds;
  if (cooldownTimer) clearInterval(cooldownTimer);
  if (scannerTimer) clearTimeout(scannerTimer);
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

function goNextToTarget(target: any, source: 'manual' | 'scanner' | 'camera' = 'manual') {
  const url = new URL(window.location.href);
  url.search = buildPublicQuery(target);
  window.history.replaceState({}, '', url.toString());
  nextInput.value = '';
  refresh();
  if (continuousMode.value && source === 'scanner') focusNextInput();
}

function applyTargetFromQueryString(qs: string) {
  const target = parsePublicTargetInput(`?${qs}`);
  if (!target) return;
  goNextToTarget(target, 'manual');
}

function openRecent(item: string) { applyTargetFromQueryString(item); }
function goNextFromInput() {
  const target = parsePublicTargetInput(nextInput.value);
  if (!target) return ElMessage.warning('请先粘贴下一项二维码链接 / token，或使用扫码枪 / 摄像头连续扫码');
  goNextToTarget(target, scanMode.value === 'scanner' ? 'scanner' : 'manual');
}

async function loadPublicConfig() {
  try {
    settings.value = await fetchPublicSettings();
    continuousMode.value = settings.value.public_inventory_continuous_mode_default;
    scanMode.value = settings.value.public_inventory_scan_mode_default;
    if (scanMode.value === 'camera' && !cameraSupported.value) scanMode.value = 'scanner';
  } catch {}
  handleNetworkChange();
}

async function refresh() {
  loading.value = true;
  error.value = '';
  clearRetry();
  try {
    if (scannerTimer) { clearTimeout(scannerTimer); scannerTimer = null; }
    syncFromLocation();
    let apiUrl = '';
    if (id.value && key.value) apiUrl = `/api/public/pc-asset?id=${encodeURIComponent(id.value)}&key=${encodeURIComponent(key.value)}`;
    else if (token.value) apiUrl = `/api/public/pc-asset?token=${encodeURIComponent(token.value)}`;
    else throw new Error('缺少二维码参数');
    const j: any = await apiGetPublic(apiUrl);
    row.value = j.data;
    saveRecentPublicTarget('pc', token.value ? { token: token.value } : { id: id.value, key: key.value });
    recentTargets.value = loadRecentPublicTargets('pc');
  } catch (e: any) {
    error.value = e?.message || '获取失败';
    if (isNetworkError(e)) {
      retryMessage.value = '网络请求失败，请检查网络后重试。';
      retryAction.value = 'refresh';
    }
  } finally {
    loading.value = false;
  }
}

function inventoryApiUrl() {
  if (id.value && key.value) return `/api/public/pc-asset-inventory?id=${encodeURIComponent(id.value)}&key=${encodeURIComponent(key.value)}`;
  if (token.value) return `/api/public/pc-asset-inventory?token=${encodeURIComponent(token.value)}`;
  return '';
}

async function onSubmitSuccess(message: string) {
  ElMessage.success(message);
  triggerSuccessVibration(settings.value.public_inventory_auto_vibrate);
  startCooldown(settings.value.public_inventory_cooldown_seconds);
  if (continuousMode.value && scanMode.value === 'scanner' && nextInput.value.trim()) {
    setTimeout(() => goNextFromInput(), 160);
  }
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
watch([continuousMode, scanMode], async ([enabled, mode]) => {
  if (!enabled) {
    stopCamera();
    return;
  }
  if (mode === 'scanner') {
    stopCamera();
    focusNextInput();
    return;
  }
  if (mode === 'camera') {
    if (!cameraSupported.value) {
      scanMode.value = 'scanner';
      return;
    }
    await startCamera();
    return;
  }
  stopCamera();
});
watch(nextInput, () => {
  if (scanMode.value === 'scanner') scheduleScannerAutoGo();
});

onMounted(async () => {
  await loadPublicConfig();
  recentTargets.value = loadRecentPublicTargets('pc');
  await refresh();
  if (continuousMode.value && scanMode.value === 'scanner') focusNextInput();
  if (continuousMode.value && scanMode.value === 'camera') await startCamera();
  window.addEventListener('resize', handleResize);
  window.addEventListener('online', handleNetworkChange);
  window.addEventListener('offline', handleNetworkChange);
});

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
  if (scannerTimer) clearTimeout(scannerTimer);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('online', handleNetworkChange);
  window.removeEventListener('offline', handleNetworkChange);
});
</script>

<style scoped>
.public-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:22px 12px;background:radial-gradient(1200px 600px at 20% 0%, rgba(66,133,244,0.12), transparent 60%),radial-gradient(1200px 600px at 80% 0%, rgba(52,199,89,0.10), transparent 60%),linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.00))}
.public-card{width:min(980px,100%);border-radius:18px}
.public-header-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.public-card-title{font-weight:800;font-size:18px}
.public-card-subtitle{font-size:12px;color:#7e7e7e;font-weight:500;margin-top:4px}
.public-alert{margin-bottom:12px}
.alert-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.public-next-card{margin-bottom:14px;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(246,248,250,.98))}
.public-next-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.public-next-switches{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.scan-mode-switch{min-width:220px}
.next-title{font-weight:700}.next-subtitle{font-size:12px;color:#7a7a7a;margin-top:4px}
.camera-panel{margin-top:12px;padding:12px;border:1px solid rgba(64,158,255,.18);border-radius:14px;background:rgba(64,158,255,.04)}
.camera-frame{position:relative;overflow:hidden;border-radius:12px;background:#0f1720;min-height:220px}
.camera-video{width:100%;height:min(46vh,320px);object-fit:cover;display:block}
.camera-overlay{position:absolute;inset:0;pointer-events:none;border:2px solid rgba(255,255,255,.42);border-radius:12px;box-shadow:inset 0 0 0 9999px rgba(0,0,0,.10)}
.camera-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
.camera-error{margin-top:8px;color:#d03050;font-size:12px;line-height:1.6}
.public-next-body{display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap}.scanner-tip{margin-top:8px;color:#7d7d7d;font-size:12px;line-height:1.5}
.recent-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
.recent-label{font-size:12px;color:#8a8a8a}
.public-actions{display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap}.cooldown{color:#999;font-size:12px}
:deep(.el-descriptions__label){width:120px;color:#666}:deep(.el-descriptions__content){color:#333}
.issue-segmented{width:100%}
.public-mobile-compact :deep(.el-button){border-radius:12px}
@media (max-width:640px){
  .public-wrap{padding:12px 8px;align-items:stretch}
  .public-card{width:100%;border-radius:16px}
  .public-header-row{align-items:flex-start}
  .public-actions{position:sticky;bottom:0;padding-top:12px;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.92) 35%,rgba(255,255,255,.98));z-index:5}
  .public-actions :deep(.el-button){flex:1 1 calc(50% - 6px);min-height:46px}
  .scan-mode-switch{width:100%}
  .camera-panel{padding:10px}
  .camera-video{height:260px}
  .public-next-body{flex-direction:column;align-items:stretch}
  .public-next-body :deep(.el-button){width:100%}
  :deep(.el-descriptions__label){width:98px}
}
</style>
