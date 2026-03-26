<template>
  <div :class="['public-wrap', settings.public_inventory_mobile_compact ? 'public-mobile-compact' : '', 'public-mobile-page']">
    <el-card class="public-card" shadow="always">
      <template #header>
        <div class="public-header-row">
          <div>
            <div class="public-card-title">
            显示器信息
            <div class="public-card-subtitle">扫码即可查看实时信息，适合现场盘点和快速复核。</div>
            </div>
            <div v-if="row?.inventory_batch_name" class="public-card-subtitle">当前批次：{{ row?.inventory_batch_name }}</div>
          </div>
          <el-tag v-if="row" :type="statusTagType(row.status)">{{ statusText(row.status) }}</el-tag>
        </div>
      </template>

      <el-alert
        v-if="settings.public_inventory_retry_hint && (retryMessage || weakNetworkHint || pendingQueue.length)"
        class="public-alert"
        :title="retryMessage || weakNetworkHint || `当前有 ${pendingQueue.length} 条待重试记录`"
        :type="retryMessage ? 'warning' : 'info'"
        show-icon
        :closable="false"
      >
        <template #default>
          <div class="alert-actions">
            <el-button size="small" @click="retryLast">重试</el-button>
            <el-button v-if="pendingQueue.length" size="small" type="primary" plain :loading="flushingQueue" @click="flushPendingQueue">提交待重试({{ pendingQueue.length }})</el-button>
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

      <PublicInventoryRecentResultCard :record="recentResult" />

      <div v-if="loading" style="padding:18px 0"><el-skeleton :rows="6" animated /></div>
      <el-alert v-else-if="error" :title="error" type="error" show-icon>
        <template #default><div class="alert-actions"><el-button size="small" @click="refresh">重试加载</el-button></div></template>
      </el-alert>

      <el-alert
        v-else-if="waitingForScan"
        class="public-alert public-batch-alert"
        title="已进入盘点执行模式"
        type="info"
        show-icon
        :closable="false"
      >
        <template #default>
          <div>请使用扫码枪、摄像头或手动粘贴下一项二维码链接 / token。扫描成功后会自动切换到对应显示器并进入连续盘点。</div>
        </template>
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

      <el-alert
        v-if="!loading && !error && !inventoryReady"
        class="public-alert public-batch-alert"
        :title="inventoryDisabledReason"
        type="warning"
        show-icon
        :closable="false"
      />

      <div v-if="!loading && !error" class="public-actions public-actions-sticky">
        <el-button size="large" type="success" :loading="submittingOk" :disabled="actionDisabled" @click="submitOk">盘点通过（在位）</el-button>
        <el-button size="large" type="warning" plain :disabled="actionDisabled" @click="openIssueDialog">报异常</el-button>
        <el-button size="large" type="primary" plain @click="refresh">刷新</el-button>
        <div v-if="cooldownLeft > 0" class="cooldown">已记录，{{ cooldownLeft }}s 后可再次提交</div>
        <div v-else-if="!inventoryReady" class="cooldown">{{ inventoryDisabledReason }}</div>
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
        <el-button size="large" type="primary" :loading="submittingIssue" :disabled="actionDisabled" @click="submitIssue">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElDescriptions, ElDescriptionsItem, ElSegmented } from 'element-plus';
import { ElSkeleton } from 'element-plus';
import { usePublicInventoryPage } from '../composables/usePublicInventoryPage';
import PublicInventoryRecentResultCard from '../components/PublicInventoryRecentResultCard.vue';

const issueOptions = [
  { label: '不在位', value: 'NOT_FOUND' },
  { label: '位置不对', value: 'WRONG_LOCATION' },
  { label: '贴错码', value: 'WRONG_QR' },
  { label: '状态不对', value: 'WRONG_STATUS' },
  { label: '疑似丢失', value: 'MISSING' },
  { label: '其他', value: 'OTHER' },
];
const issueSegmentOptions = issueOptions.map((item) => ({ label: item.label, value: item.value }));

const {
  settings,
  loading,
  error,
  row,
  submittingOk,
  submittingIssue,
  issueVisible,
  issueForm,
  cooldownLeft,
  descColumns,
  isMobile,
  continuousMode,
  scanMode,
  nextInput,
  nextInputRef,
  cameraVideoRef,
  recentTargets,
  weakNetworkHint,
  retryMessage,
  clearRetry,
  pendingQueue,
  flushingQueue,
  recentResult,
  scanModeOptions,
  nextInputPlaceholder,
  scannerTip,
  waitingForScan,
  inventoryReady,
  inventoryDisabledReason,
  actionDisabled,
  cameraSupported,
  cameraActive,
  cameraStarting,
  cameraError,
  toggleCamera,
  retryCamera,
  recentLabel,
  refresh,
  openRecent,
  goNextFromInput,
  submitOk,
  submitIssue,
  openIssueDialog,
  retryLast,
  flushPendingQueue,
} = usePublicInventoryPage({
  kind: 'monitor',
  detailPath: '/api/public/monitor-asset',
  inventoryPath: '/api/public/monitor-asset-inventory',
  autoFocusAfterSubmit: 'always',
});

function locationText(r: any) { return [r?.parent_location_name, r?.location_name].filter(Boolean).join('/') || '-'; }
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
</script>

<style scoped>
.public-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:22px 12px;background:radial-gradient(1200px 600px at 20% 0%, rgba(66,133,244,0.12), transparent 60%),radial-gradient(1200px 600px at 80% 0%, rgba(52,199,89,0.10), transparent 60%),linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.00))}
.public-card{width:min(980px,100%);border-radius:18px}
.public-header-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.public-card-title{font-weight:800;font-size:18px}.public-card-subtitle{font-size:12px;color:#7e7e7e;font-weight:500;margin-top:4px}
.public-alert{margin-bottom:12px}.alert-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.public-next-card{margin-bottom:14px;border-radius:14px;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(246,248,250,.98))}
.public-next-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.public-next-switches{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.scan-mode-switch{min-width:220px}
.next-title{font-weight:700}
.next-subtitle{font-size:12px;color:#7a7a7a;margin-top:4px}
.camera-panel{margin-top:12px;padding:12px;border:1px solid rgba(64,158,255,.18);border-radius:14px;background:rgba(64,158,255,.04)}
.camera-frame{position:relative;overflow:hidden;border-radius:12px;background:#0f1720;min-height:220px}
.camera-video{width:100%;height:min(40vh,280px);object-fit:cover;display:block}
.camera-overlay{position:absolute;inset:0;pointer-events:none;border:2px solid rgba(255,255,255,.42);border-radius:12px;box-shadow:inset 0 0 0 9999px rgba(0,0,0,.10)}
.camera-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
.camera-error{margin-top:8px;color:#d03050;font-size:12px;line-height:1.6}
.public-next-body{display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap}
.scanner-tip{margin-top:8px;color:#7d7d7d;font-size:12px;line-height:1.5}
.recent-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
.recent-label{font-size:12px;color:#8a8a8a}
.public-actions{display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap}.cooldown{color:#999;font-size:12px}
:deep(.el-descriptions__label){width:120px;color:#666}:deep(.el-descriptions__content){color:#333}.issue-segmented{width:100%}
.public-mobile-compact :deep(.el-button){border-radius:12px}
@media (max-width:640px){.public-wrap{padding:12px 8px;align-items:stretch}.public-card{width:100%;border-radius:16px}.public-header-row{align-items:flex-start}.public-actions{position:sticky;bottom:0;padding-top:12px;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.92) 35%,rgba(255,255,255,.98));z-index:5}.public-actions :deep(.el-button){flex:1 1 calc(50% - 6px);min-height:46px}.scan-mode-switch{width:100%}.camera-panel{padding:10px}.camera-frame{min-height:180px}.camera-video{height:min(32vh,220px)}.public-next-body{flex-direction:column;align-items:stretch}.public-next-body :deep(.el-button){width:100%}:deep(.el-descriptions__label){width:98px}}
</style>
