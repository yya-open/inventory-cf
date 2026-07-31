<template>
  <div class="ui-page-shell system-task-center">
    <div class="ui-page-heading">
      <div class="page-actions">
        <el-tag :type="hasActiveJobs ? 'warning' : 'success'">{{ hasActiveJobs ? '存在运行中任务' : '当前无运行中任务' }}</el-tag>
        <el-button v-if="canManageSystemTools" :loading="snapshotSubmitting" @click="createSnapshotJob">提交看板快照任务</el-button>
        <el-button @click="cleanupJobs">自动清理历史</el-button>
        <el-button @click="loadJobs()">刷新</el-button>
      </div>
    </div>

    <el-card shadow="never" class="page-card ui-panel">
      <el-row :gutter="12" class="summary-row">
        <el-col :xs="12" :md="6"><el-card shadow="never"><div class="metric-label">异步任务总数</div><div class="metric-value">{{ summary.async_job_count }}</div></el-card></el-col>
        <el-col :xs="12" :md="6"><el-card shadow="never"><div class="metric-label">排队中</div><div class="metric-value">{{ summary.queued_job_count }}</div></el-card></el-col>
        <el-col :xs="12" :md="6"><el-card shadow="never"><div class="metric-label">失败任务</div><div class="metric-value">{{ summary.failed_job_count }}</div></el-card></el-col>
        <el-col :xs="12" :md="6"><el-card shadow="never"><div class="metric-label">最近慢请求</div><div class="metric-value">{{ summary.slow_request_count }}</div></el-card></el-col>
      </el-row>

      <div class="toolbar ui-filter-panel">
        <el-select v-model="filter.status" clearable placeholder="状态" class="task-w-140" @change="applyFilters">
          <el-option label="排队中" value="queued" />
          <el-option label="执行中" value="running" />
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failed" />
          <el-option label="已取消" value="canceled" />
        </el-select>
        <el-select v-model="filter.job_type" clearable placeholder="任务类型" class="task-w-260" @change="applyFilters">
          <el-option-group v-for="group in jobTypeGroups" :key="group.label" :label="group.label">
            <el-option v-for="item in group.options" :key="item.value" :label="item.label" :value="item.value" />
          </el-option-group>
        </el-select>
        <el-select v-model="filter.days" class="task-w-140" @change="applyFilters">
          <el-option label="最近 7 天" :value="7" />
          <el-option label="最近 15 天" :value="15" />
          <el-option label="最近 30 天" :value="30" />
        </el-select>
        <el-select v-model="pageSize" class="task-w-140" @change="applyFilters">
          <el-option label="每页 20 条" :value="20" />
          <el-option label="每页 40 条" :value="40" />
          <el-option label="每页 80 条" :value="80" />
        </el-select>
        <el-switch v-model="filter.mine" active-text="仅看我发起" @change="applyFilters" />
        <el-switch v-model="pollEnabled" active-text="自动刷新" @change="handlePollToggle" />
        <el-switch v-model="compactMode" active-text="精简视图" @change="persistCompactMode" />
        <el-switch v-model="perfMode" active-text="虚拟列表性能模式" @change="persistPerfMode" />
        <el-button
          v-if="!perfMode"
          type="danger"
          plain
          :disabled="batchDeleting || deletableSelectedCount===0"
          :loading="batchDeleting"
          @click="deleteSelectedJobs"
        >
          {{ batchDeleting ? '批量删除中' : `批量删除（${deletableSelectedCount}）` }}
        </el-button>
        <span v-else class="task-mode-hint">虚拟列表模式下不可批量勾选删除，<el-button size="small" text class="task-mode-hint-btn" @click="disablePerfMode">点此关闭</el-button></span>
        <el-button v-if="perfMode" size="small" text @click="scrollVirtualTop">回到顶部</el-button>
        <div class="toolbar-meta">{{ refreshHint }}</div>
      </div>

      <div class="list-meta">
        <span>已加载 {{ jobs.length }} 条，当前渲染 {{ perfMode ? virtualRows.length : renderedJobs.length }} 条</span>
        <span v-if="hasMore">可继续加载更早任务</span>
        <span v-if="perfMode">性能模式：固定行高虚拟滚动（窗口渲染）</span>
      </div>

      <el-alert v-if="perfMode && !perfHintDismissed" type="info" :closable="false" class="task-perf-hint">
        <template #title>
          已启用虚拟列表性能模式：仅渲染可视窗口附近行，滚动更流畅；如需批量勾选删除，请先关闭该模式。
        </template>
        <template #default>
          <div class="task-perf-hint-actions">
            <el-button size="small" text @click="dismissPerfHint">我知道了，不再提示</el-button>
          </div>
        </template>
      </el-alert>

      <el-table
        v-if="!perfMode"
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
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag></template>
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
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button class="task-action-btn" text @click="openDetail(row)">详情</el-button>
              <el-button v-if="canDownload(row)" class="task-action-btn" text type="primary" @click="downloadJob(row)">下载</el-button>
              <el-button v-if="canOpenFailedAssets(row)" class="task-action-btn task-action-btn--wide" text type="primary" @click="openFailedAssets(row)">异常资产</el-button>
              <el-button v-if="row.status==='failed'" class="task-action-btn" text type="warning" @click="retryJob(row)">重试</el-button>
              <el-button v-if="row.status==='queued' || row.status==='running'" class="task-action-btn" text type="danger" @click="cancelJob(row)">取消</el-button>
          <el-button v-if="canDeleteJob(row)" class="task-action-btn" text type="danger" :loading="deletingJobId===Number(row.id)" :disabled="deletingJobId===Number(row.id) || batchDeleting" @click="deleteJob(row)">{{ deletingJobId===Number(row.id) ? '删除中' : '删除' }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div v-else class="task-virtual-shell">
        <div class="task-virtual-head">
          <div>任务信息</div>
          <div class="task-virtual-head-right">进度</div>
          <div class="task-virtual-head-right">操作</div>
        </div>
        <div ref="virtualWrapRef" class="task-virtual-wrap" @scroll="onVirtualScroll">
        <div class="task-virtual-spacer" :style="{ height: `${virtualTotalHeight}px` }">
          <div
            v-for="entry in virtualRows"
            :key="entry.row.id"
            class="task-virtual-row"
            :style="{ transform: `translateY(${entry.top}px)` }"
          >
            <div class="task-virtual-main">
              <div class="task-virtual-title">#{{ entry.row.id }} · {{ formatAsyncJobType(entry.row.job_type) }}</div>
              <div class="task-virtual-sub">{{ entry.row.created_by_name || '-' }} · {{ entry.row.created_at || '-' }} · {{ statusText(entry.row.status) }}</div>
            </div>
            <div class="task-virtual-metric">{{ Number(entry.row.progress_pct || 0) }}%</div>
            <div class="task-virtual-actions">
              <el-button class="task-action-btn" text @click="openDetail(entry.row)">详情</el-button>
              <el-button v-if="canDownload(entry.row)" class="task-action-btn" text type="primary" @click="downloadJob(entry.row)">下载</el-button>
              <el-button v-if="canOpenFailedAssets(entry.row)" class="task-action-btn task-action-btn--wide" text type="primary" @click="openFailedAssets(entry.row)">异常资产</el-button>
              <el-button v-if="entry.row.status==='failed'" class="task-action-btn" text type="warning" @click="retryJob(entry.row)">重试</el-button>
              <el-button v-if="entry.row.status==='queued' || entry.row.status==='running'" class="task-action-btn" text type="danger" @click="cancelJob(entry.row)">取消</el-button>
              <el-button v-if="canDeleteJob(entry.row)" class="task-action-btn" text type="danger" :loading="deletingJobId===Number(entry.row.id)" :disabled="deletingJobId===Number(entry.row.id) || batchDeleting" @click="deleteJob(entry.row)">{{ deletingJobId===Number(entry.row.id) ? '删除中' : '删除' }}</el-button>
            </div>
          </div>
        </div>
      </div>
      </div>

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
        <div v-if="canOpenFailedAssets(detailRow)" class="detail-block">
          <el-button type="primary" plain @click="openFailedAssets(detailRow)">查看异常资产</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiPost } from '../api/client';
import { showSuccess, showWarning } from '../utils/feedback';
import { canCapability } from '../store/auth';
import { buildAsyncJobTypeGroups, canDeleteJob, formatAsyncJobType, formatBytes, formatDuration, statusText, statusType } from '../utils/asyncJobUi';
import { useAsyncJobs, type AsyncJobRow } from '../composables/useAsyncJobs';

const COMPACT_STORAGE_KEY = 'system_task_center_compact_mode';
const PERF_STORAGE_KEY = 'system_task_center_perf_mode';
const PERF_HINT_DISMISSED_KEY = 'system_task_center_perf_hint_dismissed';
const DEFAULT_PAGE_SIZE = 40;
const RENDER_LIMIT_COMPACT = 30;
const VIRTUAL_ROW_HEIGHT = 72;
const VIRTUAL_OVERSCAN = 8;

const router = useRouter();
const snapshotSubmitting = ref(false);
const jobsTableRef = ref<any>(null);
const summary = reactive({ async_job_count: 0, queued_job_count: 0, failed_job_count: 0, slow_request_count: 0 });
const filter = reactive({ status: '', job_type: '', days: 7, mine: false });
const compactMode = ref(false);
const perfMode = ref(false);
const perfHintDismissed = ref(false);
const detailVisible = ref(false);
const detailRow = ref<any | null>(null);
const canManageSystemTools = computed(() => canCapability('system.tools.manage'));
const virtualWrapRef = ref<HTMLElement | null>(null);
const virtualScrollTop = ref(0);

const {
  jobs,
  pageSize,
  loading,
  loadingMore,
  lastSyncedAt,
  pollEnabled,
  documentHidden,
  hasMore,
  deletingJobId,
  batchDeleting,
  deletableSelectedCount,
  hasActiveJobs,
  loadJobs,
  loadMoreJobs,
  applyFilters,
  retryJob,
  cancelJob,
  cleanupJobs,
  deleteJob,
  deleteSelectedJobs,
  onSelectionChange: onJobSelectionChange,
  downloadJob,
  fetchJobDetail,
  startVisibilityTracking,
  handlePollToggle,
} = useAsyncJobs(filter, {
  limit: DEFAULT_PAGE_SIZE,
  fastPollMs: 8_000,
  idlePollMs: 180_000,
  hiddenPollMs: 0,
  onLoaded: () => syncSummaryFromJobs(),
  onJobsRemoved: (removedIds) => {
    const current = Number(detailRow.value?.id || 0);
    if (detailVisible.value && current > 0 && removedIds.includes(current)) {
      detailVisible.value = false;
      detailRow.value = null;
    }
  },
  clearTableSelection: () => jobsTableRef.value?.clearSelection?.(),
});

const jobTypeGroups = computed(() => buildAsyncJobTypeGroups(jobs.value.map((row) => row?.job_type)));
const renderedJobs = computed(() => {
  if (compactMode.value) return jobs.value.slice(0, Math.min(jobs.value.length, RENDER_LIMIT_COMPACT));
  return jobs.value;
});
const virtualVisibleCount = computed(() => {
  const wrap = virtualWrapRef.value;
  const viewport = wrap ? wrap.clientHeight : 640;
  return Math.max(10, Math.ceil(viewport / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2);
});
const virtualStartIndex = computed(() => Math.max(0, Math.floor(virtualScrollTop.value / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN));
const virtualEndIndex = computed(() => Math.min(jobs.value.length, virtualStartIndex.value + virtualVisibleCount.value));
const virtualTotalHeight = computed(() => jobs.value.length * VIRTUAL_ROW_HEIGHT);
const virtualRows = computed(() => {
  const start = virtualStartIndex.value;
  const end = virtualEndIndex.value;
  return jobs.value.slice(start, end).map((row, index) => ({ row, top: (start + index) * VIRTUAL_ROW_HEIGHT }));
});
const refreshHint = computed(() => {
  if (!pollEnabled.value) return lastSyncedAt.value ? `自动刷新已关闭 · 上次 ${formatTime(lastSyncedAt.value)}` : '自动刷新已关闭';
  const hidden = documentHidden.value;
  const mode = hasActiveJobs.value
    ? (hidden ? '页面隐藏中，已暂停自动轮询' : '检测到运行中任务，将自动轮询')
    : (hidden ? '页面隐藏中，暂停轮询' : '当前无运行中任务，超低频轮询（约 3 分钟）');
  return lastSyncedAt.value ? `${mode} · 上次 ${formatTime(lastSyncedAt.value)}` : mode;
});

function formatTime(value: any) { if (!value) return '-'; const d = new Date(value); if (Number.isNaN(d.getTime())) return String(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function canDownload(row: any) { return ['success'].includes(String(row?.status || '')) && (Number(row?.result_available || 0) === 1 || !!row?.result_content_type); }
function getAssetLink(row: any) {
  const link = row?.asset_link || {};
  const kind = String(link?.asset_kind || '').toLowerCase();
  if (kind !== 'pc' && kind !== 'monitor') return null;
  return {
    kind,
    failedAssetId: Number(link?.failed_asset_id || 0),
    failedAssetKeyword: String(link?.failed_asset_keyword || '').trim(),
    failedAssetCount: Number(link?.failed_asset_count || 0),
    inventoryStatus: String(link?.inventory_status || 'CHECKED_ISSUE').trim() || 'CHECKED_ISSUE',
  };
}
function canOpenFailedAssets(row: any) {
  const link = getAssetLink(row);
  return Boolean(link && link.failedAssetCount > 0 && (link.failedAssetId > 0 || link.failedAssetKeyword));
}
function openFailedAssets(row: any) {
  const link = getAssetLink(row);
  if (!link) return;
  const keyword = link.failedAssetId > 0 ? String(link.failedAssetId) : link.failedAssetKeyword;
  if (!keyword) return showWarning('该任务暂未定位到失败资产');
  void router.push({
    path: link.kind === 'monitor' ? '/pc/monitors' : '/pc/assets',
    query: {
      keyword,
      inventory_status: link.inventoryStatus,
      archive_mode: 'active',
      show_archived: '0',
      from_job: String(row?.id || ''),
    },
  });
}
function displayIndex(index: number) { return index + 1; }
// 汇总卡片按已加载列表统计；system-tools base 接口在高负载时会 524，
// 任务中心不再依赖它，slow_request_count 因此保持 0。
function syncSummaryFromJobs() {
  const list = jobs.value;
  summary.async_job_count = list.length;
  summary.queued_job_count = list.filter((row) => String(row?.status || '') === 'queued').length;
  summary.failed_job_count = list.filter((row) => String(row?.status || '') === 'failed').length;
}
async function openDetail(row: AsyncJobRow) {
  detailRow.value = await fetchJobDetail(row);
  detailVisible.value = true;
}
function onVirtualScroll(event: Event) {
  const target = event.target as HTMLElement | null;
  virtualScrollTop.value = target ? target.scrollTop : 0;
}
function scrollVirtualTop() {
  if (virtualWrapRef.value) {
    virtualWrapRef.value.scrollTop = 0;
    virtualScrollTop.value = 0;
  }
}
async function createSnapshotJob() {
  snapshotSubmitting.value = true;
  try {
    await apiPost('/api/system-tools', { action: 'dashboard_precompute' });
    showSuccess('已提交看板快照任务');
    await loadJobs();
  } finally {
    snapshotSubmitting.value = false;
  }
}
function persistCompactMode() {
  try { localStorage.setItem(COMPACT_STORAGE_KEY, compactMode.value ? '1' : '0'); } catch {}
}
function persistPerfMode() {
  try { localStorage.setItem(PERF_STORAGE_KEY, perfMode.value ? '1' : '0'); } catch {}
}
function disablePerfMode() {
  perfMode.value = false;
  persistPerfMode();
}
function dismissPerfHint() {
  perfHintDismissed.value = true;
  try { localStorage.setItem(PERF_HINT_DISMISSED_KEY, '1'); } catch {}
}
onMounted(() => {
  try {
    compactMode.value = localStorage.getItem(COMPACT_STORAGE_KEY) === '1' || window.innerWidth < 1360;
    perfMode.value = localStorage.getItem(PERF_STORAGE_KEY) === '1';
    perfHintDismissed.value = localStorage.getItem(PERF_HINT_DISMISSED_KEY) === '1';
  } catch {
    compactMode.value = false;
    perfMode.value = false;
    perfHintDismissed.value = false;
  }
  void loadJobs();
  startVisibilityTracking();
});
</script>

<style scoped>
.system-task-center{max-width:1680px;margin:0 auto}.page-card{border-radius:var(--radius-md)}.page-actions,.toolbar,.row-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.row-actions{gap:6px;align-content:flex-start}.summary-row{margin-bottom:12px}.summary-row :deep(.el-card){border-radius:var(--radius-md);border-color:var(--border)}.metric-label{font-size:12px;color:var(--muted)}.metric-value{font-size:28px;font-weight:800;margin-top:6px;color:var(--ink)}.toolbar{margin-bottom:8px}.toolbar-meta{margin-left:auto;font-size:12px;color:var(--muted)}.list-meta{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--muted);margin:0 0 12px}.load-more-wrap{display:flex;justify-content:center;padding-top:12px}.error-text{font-size:12px;color:var(--danger);margin-top:4px;white-space:pre-wrap}.line-clamp-2{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.detail-grid>div{display:flex;flex-direction:column;gap:4px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-md)}.detail-grid span{font-size:12px;color:var(--muted)}.detail-block{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}.detail-title{font-weight:700}.detail-text{font-size:13px;line-height:1.6;color:var(--ink-secondary);white-space:pre-wrap;word-break:break-word}.detail-pre{background:var(--surface-soft);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px}@media (max-width:768px){.toolbar-meta{width:100%;margin-left:0}.list-meta{flex-direction:column}.detail-grid{grid-template-columns:1fr}}
.row-actions :deep(.el-button),
.task-virtual-actions :deep(.el-button){
  margin-left:0;
}
.task-action-btn{
  width:64px;
  min-height:28px;
  padding:0 8px;
  border-radius:var(--radius-sm);
  justify-content:center;
  font-weight:600;
}
.task-action-btn--wide{
  width:88px;
}
.task-w-140{width:140px}
.task-w-260{width:260px}
.task-mode-hint{font-size:12px;color:var(--subtle)}
.task-mode-hint-btn{padding:0 2px;vertical-align:baseline}
.task-perf-hint{margin-bottom:10px}
.task-perf-hint-actions{display:flex;justify-content:flex-end}
.task-virtual-shell{border:1px solid var(--el-border-color);border-radius:var(--radius-md);background:var(--surface);overflow:hidden}
.task-virtual-head{display:grid;grid-template-columns:minmax(240px,1fr) 80px minmax(260px,auto);align-items:center;gap:12px;padding:10px 12px;background:var(--surface-soft);border-bottom:1px solid var(--border);font-size:12px;color:var(--muted);font-weight:600}
.task-virtual-head-right{text-align:right}
.task-virtual-wrap{height:598px;overflow:auto}
.task-virtual-spacer{position:relative;width:100%}
.task-virtual-row{position:absolute;left:0;right:0;height:64px;padding:8px 12px;display:grid;grid-template-columns:minmax(240px,1fr) 80px minmax(260px,auto);align-items:center;gap:12px;border-bottom:1px solid var(--border-soft);box-sizing:border-box}
.task-virtual-main{min-width:0}
.task-virtual-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.task-virtual-sub{font-size:12px;color:var(--subtle);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.task-virtual-metric{font-size:13px;color:var(--muted);text-align:right}
.task-virtual-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}

@media (max-width:768px){
  .page-actions,
  .toolbar,
  .row-actions{
    align-items:stretch;
  }

  .page-actions,
  .page-actions :deep(.el-button),
  .toolbar > *,
  .toolbar :deep(.el-button){
    width:100%;
    max-width:100%;
  }

  .task-w-140,
  .task-w-260{
    width:100%;
  }

  .task-virtual-head{
    grid-template-columns:minmax(0,1fr) 48px 104px;
    gap:6px;
    padding:8px;
  }

  .task-virtual-wrap{
    height:min(560px,calc(100vh - 260px));
  }

  .task-virtual-row{
    height:72px;
    grid-template-columns:minmax(0,1fr) 48px 104px;
    gap:6px;
    padding:6px 8px;
  }

  .task-virtual-title,
  .task-virtual-sub{
    white-space:normal;
    display:-webkit-box;
    -webkit-box-orient:vertical;
    overflow:hidden;
  }

  .task-virtual-title{
    -webkit-line-clamp:1;
  }

  .task-virtual-sub{
    -webkit-line-clamp:2;
  }

  .task-virtual-metric{
    text-align:center;
    font-size:12px;
  }

  .task-virtual-actions{
    justify-content:flex-end;
    gap:2px 6px;
    max-height:60px;
    overflow:hidden;
  }

  .task-virtual-actions :deep(.el-button){
    min-height:24px;
    padding:0 2px;
    font-size:12px;
  }
}
</style>
