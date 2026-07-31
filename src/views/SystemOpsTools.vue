<template>
  <div class="ui-page-shell ops-page">
    <div class="ui-page-heading">
      <div class="ops-heading-actions">
        <el-tag :type="schema.ok ? 'success' : 'danger'">{{ schema.ok ? 'Schema 已就绪' : 'Schema 未完成' }}</el-tag>
        <el-tag type="info">自动巡检 {{ autoScanMinutes }} 分钟</el-tag>
        <el-button :loading="snapshotPrecomputing" @click="runSnapshotPrecompute">{{ snapshotPrecomputing ? '提交中' : '提交快照预计算任务' }}</el-button>
        <el-button @click="reloadCurrent">刷新</el-button>
      </div>
    </div>

  <el-card class="ops-card">

    <el-alert v-if="!schema.ok" type="error" :closable="false" show-icon :title="schema.message || '数据库版本不匹配'" class="ops-gap-bottom" />
    <el-alert
      v-else-if="scan.total_problem_count > 0 || health.metrics.failed_async_jobs > 0 || health.metrics.error_5xx_last_24h > 0 || health.metrics.login_failures_last_24h > 0"
      type="warning"
      :closable="false"
      show-icon
      class="ops-gap-bottom"
      :title="`当前仍有 ${scan.total_problem_count} 类巡检问题 / ${health.metrics.failed_async_jobs || 0} 个失败任务 / ${health.metrics.error_5xx_last_24h || 0} 次近24h 5xx / ${health.metrics.login_failures_last_24h || 0} 次近24h 登录失败`"
    >
      <div>建议先处理异常再做发布或大批量操作。</div>
    </el-alert>

    <el-row :gutter="12" class="ops-gap-bottom">
      <el-col :span="6"><el-card shadow="never"><div>慢请求</div><div class="sys-metric-value">{{ dashboard.slow_request_count }}</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><div>错误请求</div><div class="sys-metric-value">{{ dashboard.error_request_count }}</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><div>异步任务</div><div class="sys-metric-value">{{ dashboard.async_job_count }}</div><div class="sys-muted">队列 {{ dashboard.queued_job_count }} / 失败 {{ dashboard.failed_job_count }}</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><div>待处理问题</div><div class="sys-metric-value">{{ dashboard.repair_problem_count }}</div><div class="sys-muted">最近巡检 {{ formatTime(scan.last_scanned_at) || '-' }}</div></el-card></el-col>
    </el-row>

    <el-tabs v-model="tab" @tab-change="onTabChange">
      <el-tab-pane label="修复中心" name="repair">
        <el-alert
          type="info"
          :closable="false"
          class="ops-gap-bottom"
          :title="scan.total_problem_count > 0 ? `当前有 ${scan.total_problem_count} 类问题，影响 ${scan.affected_rows} 条记录` : '当前巡检全绿，可只在需要时做单项重建'"
        />

        <div class="ops-action-row ops-gap-bottom">
          <el-button :loading="scanning" @click="scanAll">先扫描</el-button>
          <el-button @click="queueDeepScan">异步深度巡检</el-button>
          <el-button type="primary" :loading="running==='repair_all'" :disabled="!schema.ok" @click="runRepair('repair_all')">一键全量修复</el-button>
          <el-button :loading="running==='repair_pc_latest_state'" :disabled="!schema.ok" @click="runRepair('repair_pc_latest_state')">{{ actionButtonText('repair_pc_latest_state', '重建电脑快照') }}</el-button>
          <el-button :loading="running==='repair_dictionary_counters'" :disabled="!schema.ok" @click="runRepair('repair_dictionary_counters')">{{ actionButtonText('repair_dictionary_counters', '重算字典引用') }}</el-button>
          <el-button :loading="running==='repair_audit_materialized'" :disabled="!schema.ok" @click="runRepair('repair_audit_materialized')">{{ actionButtonText('repair_audit_materialized', '回填审计物化') }}</el-button>
          <el-button :loading="running==='repair_search_norm'" :disabled="!schema.ok" @click="runRepair('repair_search_norm')">{{ actionButtonText('repair_search_norm', '重建搜索规范化') }}</el-button>
          <el-button :loading="running==='repair_user_scope_format'" :disabled="!schema.ok" @click="runRepair('repair_user_scope_format')">{{ actionButtonText('repair_user_scope_format', '迁移权限范围格式') }}</el-button>
        </div>

        <el-row :gutter="12" class="ops-gap-bottom">
          <el-col :span="6"><el-card shadow="never"><div>扫描到的问题类型</div><div class="ops-metric-mid">{{ scan.total_problem_count }}</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never"><div>受影响记录</div><div class="ops-metric-mid">{{ scan.affected_rows }}</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never"><div>当前版本</div><div class="ops-metric-small">{{ schema.current_version || '-' }}</div><div class="sys-muted">要求 {{ schema.required_version || '-' }}</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never"><div>巡检状态</div><div class="ops-metric-small">{{ scan.scan_source === 'cache' ? '缓存结果' : '最新扫描' }}</div><div class="sys-muted">{{ formatTime(scan.last_scanned_at) || '-' }}</div></el-card></el-col>
        </el-row>

        <el-table :data="scan.items" border>
          <el-table-column prop="label" label="检查项" width="160" />
          <el-table-column label="结果" width="120">
            <template #default="{ row }"><el-tag :type="row.status==='ok' ? 'success' : 'warning'">{{ row.status==='ok' ? '正常' : '需处理' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="affected_count" label="影响数量" width="110" />
          <el-table-column prop="detail" label="检查详情" min-width="260" />
          <el-table-column prop="recommendation" label="建议" min-width="220" />
          <el-table-column label="差异明细" width="120">
            <template #default="{ row }">
              <el-button v-if="row.examples?.length" link type="primary" @click="openDiff(row)">查看明细</el-button>
              <span v-else class="sys-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="立即修复" width="130">
            <template #default="{ row }">
              <el-button v-if="row.status==='warn' && itemRepairAction(row.key)" link type="warning" @click="runRepair(itemRepairAction(row.key))">立即修复</el-button>
              <span v-else class="sys-muted">—</span>
            </template>
          </el-table-column>
        </el-table>

        <el-alert v-if="lastRepair" type="success" :closable="false" :title="lastRepair" class="ops-gap-top" />
      </el-tab-pane>

      <el-tab-pane label="异步任务" name="jobs">
        <div class="ops-action-row ops-align-center ops-gap-bottom">
          <el-select v-model="jobFilter.status" clearable placeholder="状态" class="ops-w-150" @change="applyJobFilters"><el-option label="排队中" value="queued" /><el-option label="执行中" value="running" /><el-option label="成功" value="success" /><el-option label="失败" value="failed" /><el-option label="已取消" value="canceled" /></el-select>
          <el-select v-model="jobFilter.job_type" clearable placeholder="任务类型" class="ops-w-260" @change="applyJobFilters">
            <el-option-group v-for="group in asyncJobTypeGroups" :key="group.label" :label="group.label">
              <el-option v-for="item in group.options" :key="item.value" :label="item.label" :value="item.value" />
            </el-option-group>
          </el-select>
          <el-select v-model="jobFilter.days" class="ops-w-140" @change="applyJobFilters"><el-option label="最近 7 天" :value="7" /><el-option label="最近 15 天" :value="15" /><el-option label="最近 30 天" :value="30" /></el-select>
          <el-switch v-model="jobFilter.mine" active-text="仅看我发起" @change="applyJobFilters" />
          <el-button type="danger" plain :disabled="batchDeletingJobs || deletableSelectedJobsCount===0" :loading="batchDeletingJobs" @click="deleteSelectedJobs">
            {{ batchDeletingJobs ? '批量删除中' : `批量删除（${deletableSelectedJobsCount}）` }}
          </el-button>
          <el-button @click="cleanupJobs">自动清理历史任务</el-button>
          <span class="ops-auto-refresh sys-muted">{{ jobAutoRefreshText }}</span>
        </div>

        <el-table ref="jobsTableRef" :data="renderedJobs" border row-key="id" @selection-change="onJobsSelectionChange">
          <el-table-column type="selection" width="46" reserve-selection />
          <el-table-column label="序号" width="78" align="center">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="任务类型" min-width="220">
            <template #default="{ row }">{{ formatAsyncJobType(row.job_type) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="进度" width="160">
            <template #default="{ row }">
              <el-progress :percentage="row.progress_pct || 0" :status="row.status==='failed' ? 'exception' : (row.status==='success' ? 'success' : undefined)" :stroke-width="10" />
            </template>
          </el-table-column>
          <el-table-column prop="created_by_name" label="创建人" width="120" />
          <el-table-column label="结果 / 失败原因" min-width="260">
            <template #default="{ row }">
              <div>{{ row.message || row.error_text || '-' }}</div>
              <div v-if="row.error_text" class="ops-error-text">{{ row.error_text }}</div>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="100"><template #default="{ row }">{{ formatDuration(row.duration_ms) }}</template></el-table-column>
          <el-table-column label="结果大小" width="110"><template #default="{ row }">{{ formatBytes(row.result_size) }}</template></el-table-column>
          <el-table-column label="保留期" width="170">
            <template #default="{ row }">
              <div>{{ formatTime(row.retain_until) || '-' }}</div>
               <div class="sys-muted">{{ row.is_expired ? '结果已过期' : (row.retain_until ? `剩余 ${formatDuration(row.expires_in_ms)}` : '-') }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="创建时间" width="180" />
          <el-table-column label="操作" width="300">
            <template #default="{ row }">
               <div class="ops-inline-actions">
                <el-button class="ops-action-btn" text @click="openJobDetail(row)">详情</el-button>
                <el-button v-if="row.status==='success'" class="ops-action-btn" text type="primary" @click="downloadJob(row)">下载</el-button>
                <el-button v-if="row.status==='success' && canPreviewJob(row)" class="ops-action-btn" text type="success" @click="previewJob(row)">预览</el-button>
                <el-button v-if="row.status==='success' && canPrintJob(row)" class="ops-action-btn" text type="warning" @click="printJob(row)">打印</el-button>
                <el-button v-if="['failed','canceled'].includes(row.status)" class="ops-action-btn" text type="warning" @click="retryJob(row.id)">重试</el-button>
                <el-button v-if="['queued','running'].includes(row.status)" class="ops-action-btn" text type="danger" @click="cancelJob(row.id)">取消</el-button>
                <el-button v-if="canDeleteJob(row)" class="ops-action-btn" text type="danger" :loading="deletingJobId===Number(row.id)" :disabled="deletingJobId===Number(row.id) || batchDeletingJobs" @click="deleteJob(row)">{{ deletingJobId===Number(row.id) ? '删除中' : '删除' }}</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <div class="ops-load-more-wrap">
          <el-button size="small" :disabled="jobsRenderLimit >= jobs.length" @click="jobsRenderLimit += JOB_RENDER_STEP">
            {{ jobsRenderLimit >= jobs.length ? '已显示全部任务' : `显示更多任务（已显示 ${Math.min(jobsRenderLimit, jobs.length)} / ${jobs.length}）` }}
          </el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="观测中心" name="obs">
        <div class="ops-subtitle">慢请求（近 {{ slowRows.length }} 条）</div>
        <el-table :data="renderedSlowRows" border size="small" class="ops-gap-bottom-lg"><el-table-column prop="created_at" label="时间" width="180" /><el-table-column prop="method" label="方法" width="90" /><el-table-column prop="path" label="路径" min-width="260" /><el-table-column prop="status" label="状态" width="90" /><el-table-column prop="total_ms" label="总耗时(ms)" width="120" /><el-table-column prop="sql_ms" label="SQL(ms)" width="100" /></el-table>
        <div class="ops-load-more-wrap ops-gap-bottom">
          <el-button size="small" :disabled="obsRenderLimit >= slowRows.length" @click="obsRenderLimit += OBS_RENDER_STEP">
            {{ obsRenderLimit >= slowRows.length ? '慢请求已显示全部' : `显示更多慢请求（${Math.min(obsRenderLimit, slowRows.length)} / ${slowRows.length}）` }}
          </el-button>
        </div>
        <div class="ops-subtitle">错误请求（近 {{ errorRows.length }} 条）</div>
        <el-table :data="renderedErrorRows" border size="small"><el-table-column prop="created_at" label="时间" width="180" /><el-table-column prop="method" label="方法" width="90" /><el-table-column prop="path" label="路径" min-width="260" /><el-table-column prop="status" label="状态" width="90" /><el-table-column prop="total_ms" label="总耗时(ms)" width="120" /><el-table-column prop="sql_ms" label="SQL(ms)" width="100" /></el-table>
      </el-tab-pane>

      <el-tab-pane label="健康检查" name="health">
        <el-row :gutter="12" class="ops-gap-bottom">
          <el-col :span="6"><el-card shadow="never"><div>Schema</div><div class="sys-metric-mid">{{ health.schema?.ok ? '正常' : '异常' }}</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never"><div>电脑快照缺失</div><div class="sys-metric-mid">{{ health.metrics.pc_latest_state_missing || 0 }}</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never"><div>24h 5xx</div><div class="sys-metric-mid">{{ health.metrics.error_5xx_last_24h || 0 }}</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never"><div>最近巡检</div><div class="sys-metric-small">{{ formatTime(health.scan?.last_scanned_at) || '-' }}</div></el-card></el-col>
        </el-row>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="当前迁移版本">{{ schema.current_version || '-' }}</el-descriptions-item>
          <el-descriptions-item label="要求迁移版本">{{ schema.required_version || '-' }}</el-descriptions-item>
          <el-descriptions-item label="电脑台账总数">{{ health.metrics.pc_asset_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="电脑快照总数">{{ health.metrics.pc_latest_state_count || 0 }}</el-descriptions-item>
          <el-descriptions-item label="字典计数行数">{{ health.metrics.dictionary_counter_rows || 0 }}</el-descriptions-item>
          <el-descriptions-item label="失败异步任务">{{ health.metrics.failed_async_jobs || 0 }}</el-descriptions-item>
          <el-descriptions-item label="最近一次修复">{{ health.metrics.last_repair_at || '-' }}</el-descriptions-item>
          <el-descriptions-item label="最近一次恢复演练">{{ health.metrics.last_backup_drill_at || '-' }}</el-descriptions-item>
          <el-descriptions-item label="缺失项">{{ schema.missing?.join('、') || '无' }}</el-descriptions-item>
          <el-descriptions-item label="巡检问题数">{{ health.scan?.total_problem_count || 0 }}</el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>

      <el-tab-pane label="修复历史" name="history">
        <el-alert type="info" :closable="false" class="ops-gap-bottom" title="修复历史会记录谁执行了什么修复、修前影响多少、修后剩余多少。" />
        <el-table :data="renderedRepairHistory" border>
          <el-table-column prop="created_at" label="时间" width="180" />
          <el-table-column prop="actor_name" label="执行人" width="120" />
          <el-table-column prop="action_label" label="动作" width="180" />
          <el-table-column label="修前" width="120"><template #default="{ row }">{{ row.before_problem_count }} 类 / {{ row.before_affected_rows }} 条</template></el-table-column>
          <el-table-column label="本次处理" width="100"><template #default="{ row }">{{ row.repaired_count }}</template></el-table-column>
          <el-table-column label="修后" width="120"><template #default="{ row }">{{ row.after_problem_count }} 类 / {{ row.after_affected_rows }} 条</template></el-table-column>
          <el-table-column label="结果" width="100"><template #default="{ row }"><el-tag :type="row.success ? 'success' : 'danger'">{{ row.success ? '成功' : '失败' }}</el-tag></template></el-table-column>
          <el-table-column prop="result_summary" label="摘要" min-width="280" />
        </el-table>
        <div class="ops-load-more-wrap">
          <el-button size="small" :disabled="historyRenderLimit >= repairHistory.length" @click="historyRenderLimit += HISTORY_RENDER_STEP">
            {{ historyRenderLimit >= repairHistory.length ? '修复历史已显示全部' : `显示更多修复历史（${Math.min(historyRenderLimit, repairHistory.length)} / ${repairHistory.length}）` }}
          </el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="diffDialog.visible" width="780px" :title="diffDialog.title || '差异明细'">
      <div v-if="!diffDialog.rows.length" class="sys-muted">暂无明细</div>
      <el-table v-else :data="diffDialog.rows" border size="small">
        <el-table-column v-for="col in diffDialog.columns" :key="col" :prop="col" :label="columnLabel(col)" min-width="120">
          <template v-if="col==='mismatch_fields'" #default="{ row }">
            <div class="ops-tag-wrap">
              <el-tag v-for="field in row[col] || []" :key="field" size="small" type="warning">{{ mismatchLabel(field) }}</el-tag>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  

    <el-dialog v-model="jobDetail.visible" width="680px" :title="jobDetail.title || '任务详情'">
      <template v-if="jobDetail.row">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="任务类型">{{ formatAsyncJobType(jobDetail.row.job_type) }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusText(jobDetail.row.status) }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ jobDetail.row.created_by_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(jobDetail.row.created_at) || '-' }}</el-descriptions-item>
          <el-descriptions-item label="进度">{{ Number(jobDetail.row.progress_pct || 0) }}%</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ formatDuration(jobDetail.row.duration_ms) }}</el-descriptions-item>
          <el-descriptions-item label="结果大小">{{ formatBytes(jobDetail.row.result_size) }}</el-descriptions-item>
          <el-descriptions-item label="保留期">{{ formatTime(jobDetail.row.retain_until) || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="ops-gap-top">
          <div class="ops-detail-title">结果摘要</div>
          <div class="ops-pre-wrap">{{ jobDetail.row.message || '-' }}</div>
        </div>
        <div v-if="jobDetail.row.error_text" class="ops-gap-top">
          <div class="ops-detail-title">失败原因</div>
          <pre class="ops-error-pre">{{ jobDetail.row.error_text }}</pre>
        </div>
      </template>
    </el-dialog>

  </el-card>
  </div>
</template>

<script setup lang="ts">
import { ElDescriptions, ElDescriptionsItem } from 'element-plus/es/components/descriptions/index';
import { ElTabPane, ElTabs } from 'element-plus/es/components/tabs/index';
import { ElProgress } from 'element-plus/es/components/progress/index';
import { ref, reactive, onMounted, computed } from 'vue';
import { showError, showSuccess } from '../utils/feedback';
import { apiGet, apiPost } from '../api/client';
import { getSystemHealth } from '../api/systemHealth';
import { confirmRiskAction } from '../utils/riskAction';
import { buildAsyncJobTypeGroups, canDeleteJob, formatAsyncJobType, formatBytes, formatDuration, statusText, statusType } from '../utils/asyncJobUi';
import { useSystemPageLoader } from '../composables/useSystemPageLoader';
import { useAsyncJobs, type AsyncJobRow } from '../composables/useAsyncJobs';

const autoScanMinutes = 15;
const tab = ref('repair');
const schema = reactive<any>({ ok: true, missing: [] });
const dashboard = reactive<any>({ slow_request_count: 0, error_request_count: 0, async_job_count: 0, queued_job_count: 0, failed_job_count: 0, repair_problem_count: 0 });
const scan = reactive<any>({ total_problem_count: 0, affected_rows: 0, last_scanned_at: '', scan_source: 'fresh', items: [] });
const health = reactive<any>({ schema: { ok: true }, metrics: {}, scan: null });
const slowRows = ref<any[]>([]);
const errorRows = ref<any[]>([]);
const repairHistory = ref<any[]>([]);
const JOB_RENDER_STEP = 40;
const HISTORY_RENDER_STEP = 30;
const OBS_RENDER_STEP = 30;
const JOB_LIST_LIMIT = 100;
const jobsRenderLimit = ref(JOB_RENDER_STEP);
const historyRenderLimit = ref(HISTORY_RENDER_STEP);
const obsRenderLimit = ref(OBS_RENDER_STEP);
const scanning = ref(false);
const running = ref('');
const lastRepair = ref('');
const snapshotPrecomputing = ref(false);
const jobFilter = reactive({ status: '', job_type: '', mine: true, days: 7 });
const jobsTableRef = ref<any>(null);
const diffDialog = reactive<any>({ visible: false, title: '', rows: [], columns: [] });
const jobDetail = reactive<any>({ visible: false, title: '任务详情', row: null });
const loadedTabs = reactive<Record<string, boolean>>({ repair: false, jobs: false, obs: false, health: false, history: false });

const {
  jobs,
  lastSyncMode,
  lastSyncedAt,
  documentHidden,
  pollDelayMs,
  deletingJobId,
  batchDeleting: batchDeletingJobs,
  deletableSelectedCount: deletableSelectedJobsCount,
  loadJobs,
  applyFilters: applyJobFilters,
  retryJob,
  cancelJob,
  cleanupJobs,
  deleteJob,
  deleteSelectedJobs,
  onSelectionChange: onJobsSelectionChange,
  downloadJob,
  previewJob,
  printJob,
  fetchJobDetail,
  schedulePoll: scheduleJobsPolling,
  clearPollTimer: clearJobsPollTimer,
  startVisibilityTracking,
} = useAsyncJobs(jobFilter, {
  limit: JOB_LIST_LIMIT,
  maxRows: JOB_LIST_LIMIT,
  fastPollMs: 4000,
  idlePollMs: 15000,
  hiddenPollMs: 30000,
  canPoll: () => String(tab.value || '') === 'jobs' && loadedTabs.jobs,
  onLoaded: ({ usedDelta }) => {
    if (!usedDelta) jobsRenderLimit.value = JOB_RENDER_STEP;
    loadedTabs.jobs = true;
  },
  onJobsRemoved: (removedIds) => {
    const current = Number(jobDetail.row?.id || 0);
    if (current > 0 && removedIds.includes(current)) {
      jobDetail.visible = false;
      jobDetail.row = null;
    }
  },
  clearTableSelection: () => jobsTableRef.value?.clearSelection?.(),
});

const asyncJobTypeGroups = computed(() => buildAsyncJobTypeGroups(jobs.value.map((row) => row?.job_type)));
const renderedJobs = computed(() => jobs.value.slice(0, jobsRenderLimit.value));
const renderedRepairHistory = computed(() => repairHistory.value.slice(0, historyRenderLimit.value));
const renderedSlowRows = computed(() => slowRows.value.slice(0, obsRenderLimit.value));
const renderedErrorRows = computed(() => errorRows.value.slice(0, obsRenderLimit.value));
const jobAutoRefreshText = computed(() => {
  const mode = lastSyncMode.value === 'delta' ? '增量刷新' : '全量刷新';
  const seconds = Math.round(pollDelayMs.value / 1000);
  const base = documentHidden.value ? `后台 ${seconds}s` : `${seconds}s`;
  const last = lastSyncedAt.value ? `，上次 ${formatTime(lastSyncedAt.value)}` : '';
  return `自动刷新：${mode}，${base}${last}`;
});

function formatTime(v?: string | null) {
  if (!v) return '';
  return String(v).replace('T', ' ').replace(/\.\d+Z?$/, '');
}

async function runSnapshotPrecompute() {
  snapshotPrecomputing.value = true;
  try {
    const r = await apiPost<any>('/api/jobs', { job_type: 'DASHBOARD_PRECOMPUTE', request_json: { days: 90, force: true }, retain_days: 7, max_retries: 1 });
    showSuccess(r?.message || '已提交看板快照预计算任务');
    if (loadedTabs.jobs || tab.value === 'jobs') await loadJobs();
  } catch (e: any) {
    showError(e.message || '提交看板快照预计算任务失败');
  } finally {
    snapshotPrecomputing.value = false;
  }
}

function columnLabel(key: string) {
  const map: Record<string, string> = {
    id: 'ID', serial_no: '序列号', brand: '品牌', model: '型号', dictionary_key: '字典类型', label: '字典值', expected: '期望计数', actual: '实际计数', asset_type: '资产类型', code: '编号', action: '动作', entity: '实体', entity_id: '实体ID', mismatch_fields: '不一致字段'
  };
  return map[key] || key;
}

function mismatchLabel(key: string) {
  const map: Record<string, string> = {
    module_code: '模块',
    high_risk: '高风险',
    target_name: '目标名称',
    target_code: '目标编号',
    summary_text: '摘要',
    search_text_norm: '搜索字段',
  };
  return map[key] || key;
}

function applySchema(data:any) { Object.assign(schema, data || {}); }
function applyDashboard(data:any) { Object.assign(dashboard, data || {}); }
function applyScan(data:any) { Object.assign(scan, { total_problem_count: 0, affected_rows: 0, items: [], ...data }); }

function scanItemByKey(key: string) {
  return (scan.items || []).find((item: any) => item.key === key) || null;
}

function itemRepairAction(key: string) {
  const map: Record<string, string> = {
    pc_latest_state: 'repair_pc_latest_state',
    dictionary_counters: 'repair_dictionary_counters',
    audit_materialized: 'repair_audit_materialized',
    search_norm: 'repair_search_norm',
    user_scope_format: 'repair_user_scope_format',
  };
  return map[key] || '';
}

function actionButtonText(action: string, fallback: string) {
  const byAction: Record<string, string> = {
    repair_pc_latest_state: 'pc_latest_state',
    repair_dictionary_counters: 'dictionary_counters',
    repair_audit_materialized: 'audit_materialized',
    repair_search_norm: 'search_norm',
    repair_user_scope_format: 'user_scope_format',
  };
  const item = scanItemByKey(byAction[action]);
  return item && Number(item.affected_count || 0) > 0 ? `${fallback}（${item.affected_count}）` : fallback;
}

async function loadRepairBase(force = false) {
  const payload = await repairBaseLoader.load({ force });
  applySchema(payload?.schema || {});
  applyDashboard(payload?.dashboard || {});
  applyScan(payload?.scan || {});
  if (!health.metrics || typeof health.metrics !== 'object') health.metrics = {};
  health.metrics.failed_async_jobs = Number(health.metrics.failed_async_jobs || dashboard.failed_job_count || 0);
  loadedTabs.repair = true;
}

async function loadObservability(force = false) {
  const payload = await observabilityLoader.load({ force });
  slowRows.value = payload?.slow_requests || [];
  errorRows.value = payload?.error_requests || [];
  obsRenderLimit.value = OBS_RENDER_STEP;
  loadedTabs.obs = true;
}

async function loadHealth(force = false) {
  const payload = await healthLoader.load({ force });
  health.schema = payload?.schema || { ok: true };
  health.metrics = payload?.metrics || {};
  health.scan = payload?.scan || null;
  loadedTabs.health = true;
}

async function ensureTabLoaded(name: string, force = false) {
  const target = String(name || tab.value || 'repair');
  if (target === 'repair') {
    if (force || !loadedTabs.repair) await loadRepairBase(force);
    return;
  }
  if (target === 'jobs') {
    if (force || !loadedTabs.jobs) await loadJobs();
    return;
  }
  if (target === 'history') {
    if (force || !loadedTabs.history) await loadRepairHistory();
    return;
  }
  if (target === 'obs') {
    if (force || !loadedTabs.obs) await loadObservability(force);
    return;
  }
  if (target === 'health') {
    if (force || !loadedTabs.health) await loadHealth(force);
    return;
  }
}

async function onTabChange(name: string | number) {
  const target = String(name || tab.value || 'repair');
  await ensureTabLoaded(target);
  if (target === 'jobs') scheduleJobsPolling(true);
  else clearJobsPollTimer();
}

async function reloadCurrent() {
  const current = String(tab.value || 'repair');
  await ensureTabLoaded(current, true);
  if (current === 'repair' && loadedTabs.health) await ensureTabLoaded('health', true);
}

async function queueDeepScan() {
  try {
    const r:any = await apiPost('/api/jobs', { job_type: 'OPS_SCAN_REFRESH', request_json: {}, retain_days: 7, max_retries: 1 });
    showSuccess(r.message || '已提交深度巡检任务');
    if (loadedTabs.jobs || tab.value === 'jobs') await loadJobs();
  } catch (e:any) {
    showError(e.message || '提交深度巡检任务失败');
  }
}

async function scanAll() {
  scanning.value = true;
  try {
    const r:any = await apiPost('/api/system-tools', { action: 'scan_all' });
    applyScan(r.data || {});
    dashboard.repair_problem_count = Number(r.data?.total_problem_count || 0);
    showSuccess(r.message || '扫描完成');
    await loadHealth();
  } finally {
    scanning.value = false;
  }
}

async function runRepair(action: string) {
  const itemMap: Record<string, any> = {
    repair_pc_latest_state: scanItemByKey('pc_latest_state'),
    repair_dictionary_counters: scanItemByKey('dictionary_counters'),
    repair_audit_materialized: scanItemByKey('audit_materialized'),
    repair_search_norm: scanItemByKey('search_norm'),
    repair_user_scope_format: scanItemByKey('user_scope_format'),
  };
  const item = itemMap[action];
  const affected = action === 'repair_all' ? Number(scan.affected_rows || 0) : Number(item?.affected_count || 0);
  await confirmRiskAction({
    title: action === 'repair_all' ? '全量修复预检' : '单项修复预检',
    actionLabel: action === 'repair_all' ? '一键全量修复' : (item?.label || actionButtonText(action, action)),
    affectedRows: affected,
    detail: action === 'repair_all'
      ? `当前共有 ${scan.total_problem_count} 类问题待处理，执行后会自动再扫描一次。`
      : (item?.detail || '执行后会自动再扫描一次。'),
    irreversible: false,
  });
  running.value = action;
  try {
    const r:any = await apiPost('/api/system-tools', { action });
    lastRepair.value = r.message || '修复完成';
    if (r.data?.after_scan || r.data?.after) applyScan(r.data.after_scan || r.data.after);
    else await scanAll();
    await Promise.all([loadRepairBase(), loadHealth(), loadedTabs.jobs ? loadJobs() : Promise.resolve(), loadedTabs.history ? loadRepairHistory() : Promise.resolve()]);
    showSuccess(r.message || '修复完成');
  } finally {
    running.value = '';
  }
}

async function loadRepairHistory() {
  const r:any = await apiGet('/api/system-tools?section=history');
  repairHistory.value = Array.isArray(r.data?.history) ? r.data.history : [];
  historyRenderLimit.value = HISTORY_RENDER_STEP;
  loadedTabs.history = true;
}

function canPreviewJob(row:any) {
  const contentType = String(row?.result_content_type || '').toLowerCase();
  const filename = String(row?.result_filename || '').toLowerCase();
  return contentType.includes('text/html') || contentType.includes('image/svg') || filename.endsWith('.html') || filename.endsWith('.svg');
}

function canPrintJob(row:any) {
  const contentType = String(row?.result_content_type || '').toLowerCase();
  const filename = String(row?.result_filename || '').toLowerCase();
  return contentType.includes('text/html') || filename.endsWith('.html');
}

async function openJobDetail(row: AsyncJobRow) {
  jobDetail.row = await fetchJobDetail(row);
  jobDetail.title = `${formatAsyncJobType(jobDetail.row?.job_type)} · 任务详情`;
  jobDetail.visible = true;
}

function openDiff(row:any) {
  diffDialog.title = `${row.label} 差异明细`;
  diffDialog.rows = Array.isArray(row.examples) ? row.examples : [];
  diffDialog.columns = diffDialog.rows.length ? Object.keys(diffDialog.rows[0]) : [];
  diffDialog.visible = true;
}

const repairBaseLoader = useSystemPageLoader<any>('system-ops::repair-base', {
  ttlMs: 60_000,
  backgroundRefreshMs: 60_000,
  initialData: () => ({ schema: {}, dashboard: {}, scan: {} }),
  load: async ({ force }) => {
    const suffix = force ? '&force=1' : '';
    const r: any = await apiGet(`/api/system-tools?section=base${suffix}`);
    return { schema: r.data?.schema || {}, dashboard: r.data?.dashboard || {}, scan: r.data?.scan || {} };
  },
});

const observabilityLoader = useSystemPageLoader<any>('system-ops::observability', {
  ttlMs: 45_000,
  backgroundRefreshMs: 60_000,
  initialData: () => ({ slow_requests: [], error_requests: [] }),
  load: async ({ force }) => {
    const suffix = force ? '?force=1' : '';
    const r: any = await apiGet(`/api/system-observability${suffix}`);
    return { slow_requests: r.data?.slow_requests || [], error_requests: r.data?.error_requests || [] };
  },
});

const healthLoader = useSystemPageLoader<any>('system-ops::health', {
  ttlMs: 180_000,
  backgroundRefreshMs: 60_000,
  initialData: () => ({ schema: { ok: true }, metrics: {}, scan: null }),
  load: async ({ force }) => {
    const r: any = await getSystemHealth({ force });
    return { schema: r.data?.schema || { ok: true }, metrics: r.data?.metrics || {}, scan: r.data?.scan || null };
  },
});

onMounted(() => {
  ensureTabLoaded('repair');
  startVisibilityTracking();
});
</script>

<style scoped>
.ops-heading-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ops-card :deep(.el-card__body) {
  padding: 16px;
}

.ops-gap-bottom {
  margin-bottom: 12px;
}

.ops-action-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.ops-align-center {
  align-items: center;
}

.ops-gap-top {
  margin-top: 12px;
}

.ops-gap-bottom-lg {
  margin-bottom: 16px;
}

.ops-subtitle {
  margin-bottom: 8px;
  color: var(--muted);
}

.ops-auto-refresh {
  margin-left: auto;
}

.ops-inline-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-content: flex-start;
}

.ops-inline-actions :deep(.el-button) {
  margin-left: 0;
}

.ops-action-btn {
  width: 64px;
  min-height: 28px;
  padding: 0 8px;
  border-radius:var(--radius-sm);
  justify-content: center;
  font-weight: 600;
}

.ops-tag-wrap {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ops-error-text {
  color: var(--danger);
  font-size: 12px;
}

.ops-detail-title {
  font-weight: 700;
  margin-bottom: 6px;
}

.ops-pre-wrap {
  white-space: pre-wrap;
  word-break: break-word;
}

.ops-error-pre {
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius:var(--radius-md);
  padding: 12px;
}

.ops-w-140 {
  width: 140px;
}

.ops-w-150 {
  width: 150px;
}

.ops-w-260 {
  width: 260px;
}

.ops-load-more-wrap {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

.ops-metric-mid {
  font-size: 26px;
  font-weight: 700;
}

.ops-metric-small {
  font-size: 14px;
  font-weight: 700;
}

@media (max-width: 768px) {
  .ops-heading-actions {
    justify-content: flex-start;
  }

  .sys-header-row,
  .sys-actions-row,
  .ops-action-row,
  .ops-inline-actions {
    align-items: stretch;
  }

  .sys-header-row > *,
  .sys-actions-row,
  .sys-actions-row :deep(.el-button),
  .ops-action-row > *,
  .ops-action-row :deep(.el-button),
  .ops-inline-actions,
  .ops-inline-actions :deep(.el-button) {
    width: 100%;
    max-width: 100%;
  }

  .ops-auto-refresh {
    margin-left: 0;
  }

  .ops-w-140,
  .ops-w-150,
  .ops-w-260 {
    width: 100%;
  }
}
</style>
