<template>
  <div class="system-task-center">
    <el-card shadow="never" class="page-card">
      <div class="page-header">
        <div>
          <div class="page-title">批量任务中心</div>
          <div class="page-desc">集中查看异步导出、预计算、巡检和二维码批量任务，支持下载结果、重试和取消。</div>
        </div>
        <div class="page-actions">
          <el-tag :type="hasActiveJobs ? 'warning' : 'success'">{{ hasActiveJobs ? '存在运行中任务' : '当前无运行中任务' }}</el-tag>
          <el-button v-if="canManageSystemTools" :loading="snapshotSubmitting" @click="createSnapshotJob">提交看板快照任务</el-button>
          <el-button @click="cleanupJobs">自动清理历史</el-button>
          <el-button @click="loadJobs({ force: true, includeBase: true, reset: true })">刷新</el-button>
        </div>
      </div>

      <el-row :gutter="12" class="summary-row">
        <el-col :xs="12" :md="6"><el-card shadow="never"><div class="metric-label">异步任务总数</div><div class="metric-value">{{ summary.async_job_count }}</div></el-card></el-col>
        <el-col :xs="12" :md="6"><el-card shadow="never"><div class="metric-label">排队中</div><div class="metric-value">{{ summary.queued_job_count }}</div></el-card></el-col>
        <el-col :xs="12" :md="6"><el-card shadow="never"><div class="metric-label">失败任务</div><div class="metric-value">{{ summary.failed_job_count }}</div></el-card></el-col>
        <el-col :xs="12" :md="6"><el-card shadow="never"><div class="metric-label">最近慢请求</div><div class="metric-value">{{ summary.slow_request_count }}</div></el-card></el-col>
      </el-row>

      <div class="toolbar">
        <el-select v-model="filter.status" clearable placeholder="状态" style="width:140px" @change="applyFilters">
          <el-option label="排队中" value="queued" />
          <el-option label="执行中" value="running" />
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failed" />
          <el-option label="已取消" value="canceled" />
        </el-select>
        <el-select v-model="filter.job_type" clearable placeholder="任务类型" style="width:260px" @change="applyFilters">
          <el-option-group v-for="group in jobTypeGroups" :key="group.label" :label="group.label">
            <el-option v-for="item in group.options" :key="item.value" :label="item.label" :value="item.value" />
          </el-option-group>
        </el-select>
        <el-select v-model="filter.days" style="width:140px" @change="applyFilters(true)">
          <el-option label="最近 7 天" :value="7" />
          <el-option label="最近 15 天" :value="15" />
          <el-option label="最近 30 天" :value="30" />
        </el-select>
        <el-select v-model="pageSize" style="width:140px" @change="applyFilters">
          <el-option label="每页 20 条" :value="20" />
          <el-option label="每页 40 条" :value="40" />
          <el-option label="每页 80 条" :value="80" />
        </el-select>
        <el-switch v-model="filter.mine" active-text="仅看我发起" @change="applyFilters" />
        <el-switch v-model="pollEnabled" active-text="自动刷新" @change="handlePollToggle" />
        <el-switch v-model="compactMode" active-text="精简视图" @change="persistCompactMode" />
        <el-button
          type="danger"
          plain
          :disabled="batchDeleting || deletableSelectedCount===0"
          :loading="batchDeleting"
          @click="deleteSelectedJobs"
        >
          {{ batchDeleting ? '批量删除中' : `批量删除（${deletableSelectedCount}）` }}
        </el-button>
        <div class="toolbar-meta">{{ refreshHint }}</div>
      </div>

      <div class="list-meta">
        <span>已加载 {{ jobs.length }} 条，当前渲染 {{ renderedJobs.length }} 条</span>
        <span v-if="hasMore">可继续加载更早任务</span>
      </div>

      <el-table
        ref="jobsTableRef"
        :data="renderedJobs"
        border
        v-loading="loading"
        max-height="640"
        row-key="id"
        table-layout="fixed"
        @selection-change="onJobSelectionChange"
      >
        <el-table-column type="selection" width="46" reserve-selection />
        <el-table-column label="序号" width="78" align="center">
          <template #default="{ $index }">{{ displayIndex($index) }}</template>
        </el-table-column>
        <el-table-column label="任务类型" min-width="210" show-overflow-tooltip>
          <template #default="{ row }">{{ formatAsyncJobType(row.job_type) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><el-tag :type="statusTag(row.status)">{{ statusText(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="进度" width="160">
          <template #default="{ row }">
            <el-progress :percentage="Number(row.progress_pct || 0)" :status="row.status==='failed' ? 'exception' : row.status==='success' ? 'success' : undefined" :stroke-width="10" />
          </template>
        </el-table-column>
        <el-table-column prop="created_by_name" label="创建人" width="120" />
        <el-table-column v-if="!compactMode" label="结果 / 失败原因" min-width="260">
          <template #default="{ row }">
            <div class="line-clamp-2">{{ row.message || '-' }}</div>
            <div v-if="row.error_text" class="error-text line-clamp-2">{{ row.error_text }}</div>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="100"><template #default="{ row }">{{ formatDuration(row.duration_ms) }}</template></el-table-column>
        <el-table-column v-if="!compactMode" label="结果大小" width="110"><template #default="{ row }">{{ formatBytes(row.result_size) }}</template></el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180" />
        <el-table-column label="操作" min-width="240" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button link @click="openDetail(row)">详情</el-button>
              <el-button v-if="canDownload(row)" link type="primary" @click="downloadJob(row)">下载</el-button>
              <el-button v-if="row.status==='failed'" link type="warning" @click="retryJob(row)">重试</el-button>
              <el-button v-if="row.status==='queued' || row.status==='running'" link type="danger" @click="cancelJob(row)">取消</el-button>
              <el-button v-if="canDelete(row)" link type="danger" :loading="deletingJobId===Number(row.id)" :disabled="deletingJobId===Number(row.id) || batchDeleting" @click="deleteJob(row)">{{ deletingJobId===Number(row.id) ? '删除中' : '删除' }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="load-more-wrap">
        <el-button :loading="loadingMore" :disabled="!hasMore || loading" @click="loadMoreJobs">{{ hasMore ? '加载更早任务' : '没有更多任务了' }}</el-button>
      </div>
    </el-card>

    <el-drawer v-model="detailVisible" title="任务详情" size="560px" destroy-on-close>
      <template v-if="detailRow">
        <div class="detail-grid">
          <div><span>任务 ID</span><strong>{{ detailRow.id }}</strong></div>
          <div><span>任务类型</span><strong>{{ formatAsyncJobType(detailRow.job_type) }}</strong></div>
          <div><span>状态</span><strong>{{ statusText(detailRow.status) }}</strong></div>
          <div><span>创建人</span><strong>{{ detailRow.created_by_name || '-' }}</strong></div>
          <div><span>进度</span><strong>{{ Number(detailRow.progress_pct || 0) }}%</strong></div>
          <div><span>耗时</span><strong>{{ formatDuration(detailRow.duration_ms) }}</strong></div>
          <div><span>结果大小</span><strong>{{ formatBytes(detailRow.result_size) }}</strong></div>
          <div><span>创建时间</span><strong>{{ detailRow.created_at || '-' }}</strong></div>
        </div>
        <el-divider />
        <div class="detail-block">
          <div class="detail-title">结果摘要</div>
          <div class="detail-text">{{ detailRow.message || '-' }}</div>
        </div>
        <div v-if="detailRow.error_text" class="detail-block">
          <div class="detail-title">失败原因</div>
          <pre class="detail-text detail-pre">{{ detailRow.error_text }}</pre>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { apiGet, apiPost, apiPut } from '../api/client';
import { ElMessage, ElMessageBox } from '../utils/el-services';
import { canCapability } from '../store/auth';
import { buildAsyncJobTypeGroups, formatAsyncJobType } from '../utils/asyncJobUi';

const COMPACT_STORAGE_KEY = 'system_task_center_compact_mode';
const loading = ref(false);
const loadingMore = ref(false);
const snapshotSubmitting = ref(false);
const deletingJobId = ref<number | null>(null);
const batchDeleting = ref(false);
const jobs = ref<any[]>([]);
const jobsTableRef = ref<any>(null);
const selectedJobIds = ref<number[]>([]);
const summary = reactive({ async_job_count: 0, queued_job_count: 0, failed_job_count: 0, slow_request_count: 0 });
const filter = reactive({ status: '', job_type: '', days: 7, mine: false });
const lastSyncedAt = ref('');
const pageSize = ref(40);
const hasMore = ref(false);
const cursorId = ref<number | null>(null);
const compactMode = ref(false);
const pollEnabled = ref(true);
const detailVisible = ref(false);
const detailRow = ref<any | null>(null);
const canManageSystemTools = computed(() => canCapability('system.tools.manage'));
const baseSummaryAvailable = ref(true);
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let lastBaseLoadedAt = 0;
const BASE_REFRESH_MS = 60_000;
const ACTIVE_POLL_MS = 8_000;
const IDLE_POLL_MS = 180_000;
const RENDER_LIMIT_COMPACT = 30;
const jobTypeGroups = computed(() => buildAsyncJobTypeGroups(jobs.value.map((row) => row?.job_type)));
const hasActiveJobs = computed(() => jobs.value.some((row) => ['queued', 'running'].includes(String(row?.status || ''))));
const renderedJobs = computed(() => compactMode.value ? jobs.value.slice(0, Math.min(jobs.value.length, RENDER_LIMIT_COMPACT)) : jobs.value);
const deletableSelectedCount = computed(() => {
  if (!selectedJobIds.value.length) return 0;
  const selected = new Set(selectedJobIds.value);
  return jobs.value.filter((row) => selected.has(Number(row?.id || 0)) && canDelete(row)).length;
});
const refreshHint = computed(() => {
  if (!pollEnabled.value) return lastSyncedAt.value ? `自动刷新已关闭 · 上次 ${formatTime(lastSyncedAt.value)}` : '自动刷新已关闭';
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const mode = hasActiveJobs.value
    ? (hidden ? '页面隐藏中，已暂停自动轮询' : '检测到运行中任务，将自动轮询')
    : (hidden ? '页面隐藏中，暂停轮询' : '当前无运行中任务，超低频轮询（约 3 分钟）');
  return lastSyncedAt.value ? `${mode} · 上次 ${formatTime(lastSyncedAt.value)}` : mode;
});
function statusTag(status: string) { if (status === 'success') return 'success'; if (status === 'failed') return 'danger'; if (status === 'running') return 'warning'; return 'info'; }
function statusText(status: string) { return ({ queued: '排队中', running: '执行中', success: '成功', failed: '失败', canceled: '已取消' } as Record<string, string>)[status] || status || '-'; }
function formatTime(value: any) { if (!value) return '-'; const d = new Date(value); if (Number.isNaN(d.getTime())) return String(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function formatDuration(ms: any) { const value = Number(ms || 0); if (!value || value < 0) return '-'; if (value < 1000) return `${value} ms`; const sec = value/1000; if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)} s`; const min = Math.floor(sec/60); return `${min} 分 ${Math.round(sec % 60)} 秒`; }
function formatBytes(value: any) { const num = Number(value || 0); if (!num) return '-'; if (num < 1024) return `${num} B`; if (num < 1024*1024) return `${(num/1024).toFixed(1)} KB`; return `${(num/(1024*1024)).toFixed(1)} MB`; }
function canDownload(row: any) { return ['success'].includes(String(row?.status || '')) && (row?.result_content_type || row?.result_blob_base64 || row?.result_object_key); }
function canDelete(row: any) { return !['queued', 'running'].includes(String(row?.status || '')); }
function onJobSelectionChange(rows: any[]) {
  selectedJobIds.value = (rows || [])
    .map((row: any) => Number(row?.id || 0))
    .filter((id: number) => Number.isFinite(id) && id > 0);
}
function displayIndex(index: number) { return index + 1; }
function buildDownloadUrl(row: any) { const q = new URLSearchParams(); q.set('id', String(row.id)); return `/api/jobs-download?${q.toString()}`; }
function downloadJob(row: any) { window.open(buildDownloadUrl(row), '_blank', 'noopener'); }
function syncSummaryFromJobs(rows = jobs.value) {
  const list = Array.isArray(rows) ? rows : [];
  summary.async_job_count = list.length;
  summary.queued_job_count = list.filter((row) => String(row?.status || '') === 'queued').length;
  summary.failed_job_count = list.filter((row) => String(row?.status || '') === 'failed').length;
  if (!baseSummaryAvailable.value) summary.slow_request_count = 0;
}
async function openDetail(row: any) {
  try {
    const r:any = await apiGet(`/api/jobs?ids=${encodeURIComponent(String(row.id))}&limit=1&days=90`);
    const found = normalizeJobRowsResponse(r)?.[0] || row;
    detailRow.value = found;
    detailVisible.value = true;
  } catch {
    detailRow.value = row;
    detailVisible.value = true;
  }
}
async function loadBase() {
  try {
    const r:any = await apiGet('/api/system-tools?section=base');
    const dashboard = r?.data?.dashboard || {};
    summary.async_job_count = Number(dashboard.async_job_count || 0);
    summary.queued_job_count = Number(dashboard.queued_job_count || 0);
    summary.failed_job_count = Number(dashboard.failed_job_count || 0);
    summary.slow_request_count = Number(dashboard.slow_request_count || 0);
    baseSummaryAvailable.value = true;
    lastBaseLoadedAt = Date.now();
  } catch {
    baseSummaryAvailable.value = false;
    syncSummaryFromJobs();
    lastBaseLoadedAt = Date.now();
  }
}
function clearPollTimer() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}
function schedulePoll() {
  clearPollTimer();
  if (!pollEnabled.value) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  pollTimer = setTimeout(() => {
    void loadJobs({ silent: true, includeBase: Date.now() - lastBaseLoadedAt > BASE_REFRESH_MS, reset: true });
  }, hasActiveJobs.value ? ACTIVE_POLL_MS : IDLE_POLL_MS);
}
function buildQuery(afterId?: number | null) {
  const q = new URLSearchParams();
  q.set('limit', String(pageSize.value || 40));
  q.set('days', String(filter.days || 7));
  if (filter.status) q.set('status', filter.status);
  if (filter.job_type) q.set('job_type', filter.job_type);
  if (filter.mine) q.set('mine', '1');
  if (afterId) q.set('after_id', String(afterId));
  return q.toString();
}
function normalizeJobRowsResponse(payload: any) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
}
function mergeJobs(rows: any[], append = false) {
  const next = append ? [...jobs.value, ...rows] : rows;
  const seen = new Set<number>();
  jobs.value = next.filter((row) => {
    const id = Number(row?.id || 0);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  cursorId.value = jobs.value.length ? Number(jobs.value[jobs.value.length - 1]?.id || 0) : null;
}
async function loadJobs(opts: { force?: boolean; includeBase?: boolean; silent?: boolean; reset?: boolean } = {}) {
  if (loading.value && !opts.silent) return;
  if (!opts.silent) loading.value = true;
  try {
    if (opts.includeBase && (opts.force || !lastBaseLoadedAt || (Date.now() - lastBaseLoadedAt) > BASE_REFRESH_MS)) await loadBase();
    const r:any = await apiGet(`/api/jobs?${buildQuery()}`);
    const rows = normalizeJobRowsResponse(r);
    mergeJobs(rows, false);
    if (!baseSummaryAvailable.value) syncSummaryFromJobs();
    hasMore.value = rows.length >= Number(pageSize.value || 40);
    lastSyncedAt.value = new Date().toISOString();
  } finally {
    loading.value = false;
    schedulePoll();
  }
}
async function loadMoreJobs() {
  if (!hasMore.value || !cursorId.value || loadingMore.value) return;
  loadingMore.value = true;
  try {
    const r:any = await apiGet(`/api/jobs?${buildQuery(cursorId.value)}`);
    const rows = normalizeJobRowsResponse(r);
    mergeJobs(rows, true);
    if (!baseSummaryAvailable.value) syncSummaryFromJobs();
    hasMore.value = rows.length >= Number(pageSize.value || 40);
    lastSyncedAt.value = new Date().toISOString();
  } finally {
    loadingMore.value = false;
  }
}
async function createSnapshotJob() {
  snapshotSubmitting.value = true;
  try {
    await apiPost('/api/system-tools', { action: 'dashboard_precompute' });
    ElMessage.success('已提交看板快照任务');
    await loadJobs({ force: true, includeBase: true, reset: true });
  } finally {
    snapshotSubmitting.value = false;
  }
}
async function retryJob(row: any) {
  await ElMessageBox.confirm(`确定重试任务 #${row.id} 吗？`, '提示', { type: 'warning' });
  await apiPut('/api/jobs', { action: 'retry', id: row.id });
  ElMessage.success('已提交重试');
  await loadJobs({ force: true, includeBase: true, reset: true });
}
async function cancelJob(row: any) {
  await ElMessageBox.confirm(`确定取消任务 #${row.id} 吗？`, '提示', { type: 'warning' });
  await apiPut('/api/jobs', { action: 'cancel', id: row.id });
  ElMessage.success('任务已取消');
  await loadJobs({ force: true, includeBase: true, reset: true });
}
async function cleanupJobs() {
  await ElMessageBox.confirm('自动清理会删除较旧的成功/失败历史任务，是否继续？', '提示', { type: 'warning' });
  await apiPut('/api/jobs', { action: 'cleanup' });
  ElMessage.success('已提交清理任务');
  await loadJobs({ force: true, includeBase: true, reset: true });
}
async function deleteJob(row: any) {
  if (batchDeleting.value) return;
  await ElMessageBox.confirm(`确定删除任务“${formatAsyncJobType(row?.job_type)}”吗？删除后不可恢复。`, '提示', { type: 'warning' });
  deletingJobId.value = Number(row?.id || 0) || null;
  try {
    await apiPut('/api/jobs', { action: 'delete', id: row.id });
    if (detailVisible.value && Number(detailRow.value?.id || 0) === Number(row.id || 0)) {
      detailVisible.value = false;
      detailRow.value = null;
    }
    ElMessage.success('任务已删除');
    await loadJobs({ force: true, includeBase: true, reset: true });
  } finally {
    deletingJobId.value = null;
  }
}

async function deleteSelectedJobs() {
  if (batchDeleting.value) return;
  const selected = new Set(selectedJobIds.value);
  const selectedRows = jobs.value.filter((row) => selected.has(Number(row?.id || 0)));
  if (!selectedRows.length) return ElMessage.warning('请先勾选任务');
  const deletableRows = selectedRows.filter((row) => canDelete(row));
  const blocked = Math.max(0, selectedRows.length - deletableRows.length);
  if (!deletableRows.length) return ElMessage.warning('选中任务均为运行中/排队中，无法删除');

  await ElMessageBox.confirm(
    blocked
      ? `确定批量删除 ${deletableRows.length} 条任务吗？其中 ${blocked} 条运行中/排队中任务会自动跳过。`
      : `确定批量删除 ${deletableRows.length} 条任务吗？删除后不可恢复。`,
    '批量删除任务',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  );

  const loading = ElMessage({ type: 'info', message: '正在批量删除任务，请稍候…', duration: 0, showClose: false });
  batchDeleting.value = true;
  let success = 0;
  let failed = 0;
  try {
    const result: any = await apiPut('/api/jobs', { action: 'delete_batch', ids: deletableRows.map((row) => Number(row.id)) });
    success = Number(result?.data?.deleted ?? result?.deleted ?? 0);
    failed = Number(result?.data?.failed ?? result?.failed ?? 0);
    if (detailVisible.value && selected.has(Number(detailRow.value?.id || 0))) {
      detailVisible.value = false;
      detailRow.value = null;
    }
    if (failed) ElMessage.warning(`批量删除完成：成功 ${success} 条，失败 ${failed} 条`);
    else ElMessage.success(`批量删除完成：共删除 ${success} 条`);
    selectedJobIds.value = [];
    jobsTableRef.value?.clearSelection?.();
    await loadJobs({ force: true, includeBase: true, reset: true });
  } catch (error: any) {
    ElMessage.error(error?.message || '批量删除任务失败');
  } finally {
    loading.close();
    batchDeleting.value = false;
  }
}

function applyFilters(forceBase = false) {
  hasMore.value = false;
  cursorId.value = null;
  void loadJobs({ force: true, includeBase: forceBase || true, reset: true });
}
function persistCompactMode() {
  try { localStorage.setItem(COMPACT_STORAGE_KEY, compactMode.value ? '1' : '0'); } catch {}
}
function handlePollToggle() {
  if (!pollEnabled.value) {
    clearPollTimer();
    return;
  }
  void loadJobs({ includeBase: false, silent: true, reset: true });
}
function onVisibilityChange() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible' && pollEnabled.value) {
    void loadJobs({ includeBase: Date.now() - lastBaseLoadedAt > BASE_REFRESH_MS, silent: true, reset: true });
  } else {
    clearPollTimer();
  }
}
watch(() => [filter.status, filter.job_type, filter.days, filter.mine, pageSize.value], () => {
  hasMore.value = false;
  cursorId.value = null;
});
watch(jobs, () => {
  if (!selectedJobIds.value.length) return;
  const keep = new Set(jobs.value.map((row: any) => Number(row?.id || 0)).filter((id: number) => id > 0));
  selectedJobIds.value = selectedJobIds.value.filter((id) => keep.has(id));
});
onMounted(() => {
  try {
    compactMode.value = localStorage.getItem(COMPACT_STORAGE_KEY) === '1' || window.innerWidth < 1360;
  } catch {
    compactMode.value = false;
  }
  void loadJobs({ includeBase: true, reset: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
});
onBeforeUnmount(() => {
  clearPollTimer();
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>

<style scoped>
.system-task-center{display:flex;flex-direction:column;gap:12px}.page-card{border-radius:16px}.page-header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}.page-title{font-size:18px;font-weight:800}.page-desc{font-size:13px;color:#6b7280;margin-top:4px}.page-actions,.toolbar,.row-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.summary-row{margin-bottom:12px}.metric-label{font-size:12px;color:#6b7280}.metric-value{font-size:28px;font-weight:800;margin-top:6px}.toolbar{margin-bottom:8px}.toolbar-meta{margin-left:auto;font-size:12px;color:#6b7280}.list-meta{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#6b7280;margin:0 0 12px}.load-more-wrap{display:flex;justify-content:center;padding-top:12px}.error-text{font-size:12px;color:#c45656;margin-top:4px;white-space:pre-wrap}.line-clamp-2{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.detail-grid>div{display:flex;flex-direction:column;gap:4px;padding:10px;border:1px solid #e5e7eb;border-radius:12px}.detail-grid span{font-size:12px;color:#6b7280}.detail-block{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}.detail-title{font-weight:700}.detail-text{font-size:13px;line-height:1.6;color:#374151;white-space:pre-wrap;word-break:break-word}.detail-pre{background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:12px}@media (max-width:768px){.toolbar-meta{width:100%;margin-left:0}.list-meta{flex-direction:column}.detail-grid{grid-template-columns:1fr}}
</style>
