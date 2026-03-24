<template>
  <el-card>
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; flex-wrap:wrap">
      <div>
        <div style="font-weight:700">运维工具</div>
        <div style="color:#999; font-size:12px">数据库版本校验、自动巡检、修复中心、异步任务中心、性能与错误观测、健康检查</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
        <el-tag :type="schema.ok ? 'success' : 'danger'">{{ schema.ok ? 'Schema 已就绪' : 'Schema 未完成' }}</el-tag>
        <el-tag type="info">自动巡检 {{ autoScanMinutes }} 分钟</el-tag>
        <el-button :loading="snapshotPrecomputing" @click="runSnapshotPrecompute">{{ snapshotPrecomputing ? '提交中' : '提交快照预计算任务' }}</el-button>
        <el-button @click="reloadCurrent">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="!schema.ok" type="error" :closable="false" show-icon :title="schema.message || '数据库版本不匹配'" style="margin-bottom:12px" />
    <el-alert
      v-else-if="scan.total_problem_count > 0 || health.metrics.failed_async_jobs > 0 || health.metrics.error_5xx_last_24h > 0"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom:12px"
      :title="`当前仍有 ${scan.total_problem_count} 类巡检问题 / ${health.metrics.failed_async_jobs || 0} 个失败任务 / ${health.metrics.error_5xx_last_24h || 0} 次近24h 5xx`"
    >
      <div>建议先处理异常再做发布或大批量操作。</div>
    </el-alert>

    <el-row :gutter="12" style="margin-bottom:12px">
      <el-col :span="6"><el-card shadow="never"><div>慢请求</div><div style="font-size:28px; font-weight:700">{{ dashboard.slow_request_count }}</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><div>错误请求</div><div style="font-size:28px; font-weight:700">{{ dashboard.error_request_count }}</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><div>异步任务</div><div style="font-size:28px; font-weight:700">{{ dashboard.async_job_count }}</div><div style="font-size:12px; color:#999">队列 {{ dashboard.queued_job_count }} / 失败 {{ dashboard.failed_job_count }}</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><div>待处理问题</div><div style="font-size:28px; font-weight:700">{{ dashboard.repair_problem_count }}</div><div style="font-size:12px; color:#999">最近巡检 {{ formatTime(scan.last_scanned_at) || '-' }}</div></el-card></el-col>
    </el-row>

    <el-tabs v-model="tab" @tab-change="onTabChange">
      <el-tab-pane label="修复中心" name="repair">
        <el-alert
          type="info"
          :closable="false"
          style="margin-bottom:12px"
          :title="scan.total_problem_count > 0 ? `当前有 ${scan.total_problem_count} 类问题，影响 ${scan.affected_rows} 条记录` : '当前巡检全绿，可只在需要时做单项重建'"
        />

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px">
          <el-button :loading="scanning" @click="scanAll">先扫描</el-button>
          <el-button @click="queueDeepScan">异步深度巡检</el-button>
          <el-button type="primary" :loading="running==='repair_all'" :disabled="!schema.ok" @click="runRepair('repair_all')">一键全量修复</el-button>
          <el-button :loading="running==='repair_pc_latest_state'" :disabled="!schema.ok" @click="runRepair('repair_pc_latest_state')">{{ actionButtonText('repair_pc_latest_state', '重建电脑快照') }}</el-button>
          <el-button :loading="running==='repair_dictionary_counters'" :disabled="!schema.ok" @click="runRepair('repair_dictionary_counters')">{{ actionButtonText('repair_dictionary_counters', '重算字典引用') }}</el-button>
          <el-button :loading="running==='repair_audit_materialized'" :disabled="!schema.ok" @click="runRepair('repair_audit_materialized')">{{ actionButtonText('repair_audit_materialized', '回填审计物化') }}</el-button>
          <el-button :loading="running==='repair_search_norm'" :disabled="!schema.ok" @click="runRepair('repair_search_norm')">{{ actionButtonText('repair_search_norm', '重建搜索规范化') }}</el-button>
        </div>

        <el-row :gutter="12" style="margin-bottom:12px">
          <el-col :span="6"><el-card shadow="never"><div>扫描到的问题类型</div><div style="font-size:26px; font-weight:700">{{ scan.total_problem_count }}</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never"><div>受影响记录</div><div style="font-size:26px; font-weight:700">{{ scan.affected_rows }}</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never"><div>当前版本</div><div style="font-size:14px; font-weight:700">{{ schema.current_version || '-' }}</div><div style="font-size:12px; color:#999">要求 {{ schema.required_version || '-' }}</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never"><div>巡检状态</div><div style="font-size:14px; font-weight:700">{{ scan.scan_source === 'cache' ? '缓存结果' : '最新扫描' }}</div><div style="font-size:12px; color:#999">{{ formatTime(scan.last_scanned_at) || '-' }}</div></el-card></el-col>
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
              <span v-else style="color:#999">—</span>
            </template>
          </el-table-column>
          <el-table-column label="立即修复" width="130">
            <template #default="{ row }">
              <el-button v-if="row.status==='warn' && itemRepairAction(row.key)" link type="warning" @click="runRepair(itemRepairAction(row.key))">立即修复</el-button>
              <span v-else style="color:#999">—</span>
            </template>
          </el-table-column>
        </el-table>

        <el-alert v-if="lastRepair" type="success" :closable="false" :title="lastRepair" style="margin-top:12px" />
      </el-tab-pane>

      <el-tab-pane label="异步任务" name="jobs">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
          <el-select v-model="jobFilter.status" clearable placeholder="状态" style="width:150px" @change="loadJobs"><el-option label="排队中" value="queued" /><el-option label="执行中" value="running" /><el-option label="成功" value="success" /><el-option label="失败" value="failed" /><el-option label="已取消" value="canceled" /></el-select>
          <el-select v-model="jobFilter.job_type" clearable placeholder="任务类型" style="width:220px" @change="loadJobs"><el-option label="审计导出" value="AUDIT_EXPORT" /><el-option label="报废预警导出" value="PC_AGE_WARNING_EXPORT" /><el-option label="看板快照预计算" value="DASHBOARD_PRECOMPUTE" /><el-option label="深度巡检" value="OPS_SCAN_REFRESH" /><el-option label="电脑二维码补齐" value="PC_QR_KEY_INIT" /><el-option label="显示器二维码补齐" value="MONITOR_QR_KEY_INIT" /><el-option label="电脑二维码卡片" value="PC_QR_CARDS_EXPORT" /><el-option label="电脑二维码图版" value="PC_QR_SHEET_EXPORT" /><el-option label="显示器二维码卡片" value="MONITOR_QR_CARDS_EXPORT" /><el-option label="显示器二维码图版" value="MONITOR_QR_SHEET_EXPORT" /></el-select>
          <el-select v-model="jobFilter.days" style="width:140px" @change="loadJobs"><el-option label="最近 7 天" :value="7" /><el-option label="最近 15 天" :value="15" /><el-option label="最近 30 天" :value="30" /></el-select>
          <el-switch v-model="jobFilter.mine" active-text="仅看我发起" @change="loadJobs" />
          <el-button @click="cleanupJobs">自动清理历史任务</el-button>
        </div>

        <el-table :data="jobs" border>
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="job_type" label="任务类型" min-width="160" />
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
              <div v-if="row.error_text" style="color:#c45656; font-size:12px">{{ row.error_text }}</div>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="100"><template #default="{ row }">{{ formatDuration(row.duration_ms) }}</template></el-table-column>
          <el-table-column label="结果大小" width="110"><template #default="{ row }">{{ formatBytes(row.result_size) }}</template></el-table-column>
          <el-table-column label="保留期" width="170">
            <template #default="{ row }">
              <div>{{ formatTime(row.retain_until) || '-' }}</div>
              <div style="font-size:12px; color:#999">{{ row.is_expired ? '结果已过期' : (row.retain_until ? `剩余 ${formatDuration(row.expires_in_ms)}` : '-') }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="创建时间" width="180" />
          <el-table-column label="操作" min-width="220">
            <template #default="{ row }">
              <div style="display:flex; gap:8px; flex-wrap:wrap">
                <el-button v-if="row.status==='success'" link type="primary" @click="downloadJob(row)">下载</el-button>
                <el-button v-if="row.status==='success' && canPreviewJob(row)" link type="success" @click="previewJob(row)">预览</el-button>
                <el-button v-if="row.status==='success' && canPrintJob(row)" link type="warning" @click="printJob(row)">打印</el-button>
                <el-button v-if="['failed','canceled'].includes(row.status)" link type="warning" @click="retryJob(row.id)">重试</el-button>
                <el-button v-if="['queued','running'].includes(row.status)" link type="danger" @click="cancelJob(row.id)">取消</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="观测中心" name="obs">
        <div style="margin-bottom:8px; color:#666">慢请求（近 {{ slowRows.length }} 条）</div>
        <el-table :data="slowRows" border size="small" style="margin-bottom:16px"><el-table-column prop="created_at" label="时间" width="180" /><el-table-column prop="method" label="方法" width="90" /><el-table-column prop="path" label="路径" min-width="260" /><el-table-column prop="status" label="状态" width="90" /><el-table-column prop="total_ms" label="总耗时(ms)" width="120" /><el-table-column prop="sql_ms" label="SQL(ms)" width="100" /></el-table>
        <div style="margin-bottom:8px; color:#666">错误请求（近 {{ errorRows.length }} 条）</div>
        <el-table :data="errorRows" border size="small"><el-table-column prop="created_at" label="时间" width="180" /><el-table-column prop="method" label="方法" width="90" /><el-table-column prop="path" label="路径" min-width="260" /><el-table-column prop="status" label="状态" width="90" /><el-table-column prop="total_ms" label="总耗时(ms)" width="120" /><el-table-column prop="sql_ms" label="SQL(ms)" width="100" /></el-table>
      </el-tab-pane>

      <el-tab-pane label="健康检查" name="health">
        <el-row :gutter="12" style="margin-bottom:12px">
          <el-col :span="6"><el-card shadow="never"><div>Schema</div><div style="font-size:26px; font-weight:700">{{ health.schema?.ok ? '正常' : '异常' }}</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never"><div>电脑快照缺失</div><div style="font-size:26px; font-weight:700">{{ health.metrics.pc_latest_state_missing || 0 }}</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never"><div>24h 5xx</div><div style="font-size:26px; font-weight:700">{{ health.metrics.error_5xx_last_24h || 0 }}</div></el-card></el-col>
          <el-col :span="6"><el-card shadow="never"><div>最近巡检</div><div style="font-size:14px; font-weight:700">{{ formatTime(health.scan?.last_scanned_at) || '-' }}</div></el-card></el-col>
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
        <el-alert type="info" :closable="false" style="margin-bottom:12px" title="修复历史会记录谁执行了什么修复、修前影响多少、修后剩余多少。" />
        <el-table :data="repairHistory" border>
          <el-table-column prop="created_at" label="时间" width="180" />
          <el-table-column prop="actor_name" label="执行人" width="120" />
          <el-table-column prop="action_label" label="动作" width="180" />
          <el-table-column label="修前" width="120"><template #default="{ row }">{{ row.before_problem_count }} 类 / {{ row.before_affected_rows }} 条</template></el-table-column>
          <el-table-column label="本次处理" width="100"><template #default="{ row }">{{ row.repaired_count }}</template></el-table-column>
          <el-table-column label="修后" width="120"><template #default="{ row }">{{ row.after_problem_count }} 类 / {{ row.after_affected_rows }} 条</template></el-table-column>
          <el-table-column label="结果" width="100"><template #default="{ row }"><el-tag :type="row.success ? 'success' : 'danger'">{{ row.success ? '成功' : '失败' }}</el-tag></template></el-table-column>
          <el-table-column prop="result_summary" label="摘要" min-width="280" />
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="diffDialog.visible" width="780px" :title="diffDialog.title || '差异明细'">
      <div v-if="!diffDialog.rows.length" style="color:#999">暂无明细</div>
      <el-table v-else :data="diffDialog.rows" border size="small">
        <el-table-column v-for="col in diffDialog.columns" :key="col" :prop="col" :label="columnLabel(col)" min-width="120">
          <template v-if="col==='mismatch_fields'" #default="{ row }">
            <div style="display:flex; gap:6px; flex-wrap:wrap">
              <el-tag v-for="field in row[col] || []" :key="field" size="small" type="warning">{{ mismatchLabel(field) }}</el-tag>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ElDescriptions, ElDescriptionsItem, ElTabPane, ElTabs } from 'element-plus';
import { ElProgress } from 'element-plus';
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from '../utils/el-services';
import { apiGet, apiPost, apiPut } from '../api/client';
import { getSystemHealth } from '../api/systemHealth';
import { confirmRiskAction } from '../utils/riskAction';
import { downloadJobResultCached, openJobResultCached } from '../utils/jobResultCache';

const autoScanMinutes = 15;
type JobRow = any;
const tab = ref('repair');
const schema = reactive<any>({ ok: true, missing: [] });
const dashboard = reactive<any>({ slow_request_count: 0, error_request_count: 0, async_job_count: 0, queued_job_count: 0, failed_job_count: 0, repair_problem_count: 0 });
const scan = reactive<any>({ total_problem_count: 0, affected_rows: 0, last_scanned_at: '', scan_source: 'fresh', items: [] });
const health = reactive<any>({ schema: { ok: true }, metrics: {}, scan: null });
const slowRows = ref<any[]>([]);
const errorRows = ref<any[]>([]);
const jobs = ref<JobRow[]>([]);
const repairHistory = ref<any[]>([]);
const scanning = ref(false);
const running = ref('');
const lastRepair = ref('');
const snapshotPrecomputing = ref(false);
const jobFilter = reactive({ status: '', job_type: '', mine: true, days: 7 });
const diffDialog = reactive<any>({ visible: false, title: '', rows: [], columns: [] });
const loadedTabs = reactive<Record<string, boolean>>({ repair: false, jobs: false, obs: false, health: false, history: false });

function formatTime(v?: string | null) {
  if (!v) return '';
  return String(v).replace('T', ' ').replace(/\.\d+Z?$/, '');
}

function formatDuration(ms?: number | null) {
  const value = Number(ms || 0);
  if (!value) return '-';
  if (value >= 1000 * 60 * 60 * 24) return `${Math.floor(value / 1000 / 60 / 60 / 24)}天`;
  if (value >= 1000 * 60 * 60) return `${Math.floor(value / 1000 / 60 / 60)}小时`;
  if (value >= 1000 * 60) return `${Math.floor(value / 1000 / 60)}分钟`;
  if (value >= 1000) return `${Math.floor(value / 1000)}秒`;
  return `${value}ms`;
}


async function runSnapshotPrecompute() {
  snapshotPrecomputing.value = true;
  try {
    const r = await apiPost<any>('/api/jobs', { job_type: 'DASHBOARD_PRECOMPUTE', request_json: { days: 90, force: true }, retain_days: 7, max_retries: 1 });
    ElMessage.success(r?.message || '已提交看板快照预计算任务');
    if (loadedTabs.jobs || tab.value === 'jobs') await loadJobs();
  } catch (e: any) {
    ElMessage.error(e.message || '提交看板快照预计算任务失败');
  } finally {
    snapshotPrecomputing.value = false;
  }
}

function formatBytes(value?: number | null) {
  const size = Number(value || 0);
  if (!size) return '-';
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  return `${(size / 1024).toFixed(1)} KB`;
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

function statusType(status: string) {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'canceled') return 'info';
  if (status === 'running') return 'warning';
  return 'info';
}

function statusText(status: string) {
  const map: Record<string, string> = { queued: '排队中', running: '执行中', success: '成功', failed: '失败', canceled: '已取消' };
  return map[status] || status;
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
  };
  return map[key] || '';
}

function actionButtonText(action: string, fallback: string) {
  const byAction: Record<string, string> = {
    repair_pc_latest_state: 'pc_latest_state',
    repair_dictionary_counters: 'dictionary_counters',
    repair_audit_materialized: 'audit_materialized',
    repair_search_norm: 'search_norm',
  };
  const item = scanItemByKey(byAction[action]);
  return item && Number(item.affected_count || 0) > 0 ? `${fallback}（${item.affected_count}）` : fallback;
}

async function loadRepairBase() {
  const r:any = await apiGet('/api/system-tools');
  applySchema(r.data?.schema || {});
  applyDashboard(r.data?.dashboard || {});
  applyScan(r.data?.scan || {});
  if (!health.metrics || typeof health.metrics !== 'object') health.metrics = {};
  health.metrics.failed_async_jobs = Number(health.metrics.failed_async_jobs || dashboard.failed_job_count || 0);
  loadedTabs.repair = true;
}

async function loadObservability() {
  const r:any = await apiGet('/api/system-observability');
  slowRows.value = r.data?.slow_requests || [];
  errorRows.value = r.data?.error_requests || [];
  loadedTabs.obs = true;
}

async function loadHealth() {
  const r:any = await getSystemHealth({ force: true });
  health.schema = r.data?.schema || { ok: true };
  health.metrics = r.data?.metrics || {};
  health.scan = r.data?.scan || null;
  loadedTabs.health = true;
}

async function ensureTabLoaded(name: string, force = false) {
  const target = String(name || tab.value || 'repair');
  if (target === 'repair') {
    if (force || !loadedTabs.repair) await loadRepairBase();
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
    if (force || !loadedTabs.obs) await loadObservability();
    return;
  }
  if (target === 'health') {
    if (force || !loadedTabs.health) await loadHealth();
    return;
  }
}

async function onTabChange(name: string | number) {
  await ensureTabLoaded(String(name || tab.value || 'repair'));
}

async function reloadCurrent() {
  const current = String(tab.value || 'repair');
  await ensureTabLoaded(current, true);
  if (current === 'repair' && loadedTabs.health) await ensureTabLoaded('health', true);
}

async function queueDeepScan() {
  try {
    const r:any = await apiPost('/api/jobs', { job_type: 'OPS_SCAN_REFRESH', request_json: {}, retain_days: 7, max_retries: 1 });
    ElMessage.success(r.message || '已提交深度巡检任务');
    if (loadedTabs.jobs || tab.value === 'jobs') await loadJobs();
  } catch (e:any) {
    ElMessage.error(e.message || '提交深度巡检任务失败');
  }
}

async function scanAll() {
  scanning.value = true;
  try {
    const r:any = await apiPost('/api/system-tools', { action: 'scan_all' });
    applyScan(r.data || {});
    dashboard.repair_problem_count = Number(r.data?.total_problem_count || 0);
    ElMessage.success(r.message || '扫描完成');
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
    ElMessage.success(r.message || '修复完成');
  } finally {
    running.value = '';
  }
}

async function loadJobs() {
  const q = new URLSearchParams();
  if (jobFilter.status) q.set('status', jobFilter.status);
  if (jobFilter.job_type) q.set('job_type', jobFilter.job_type);
  if (jobFilter.mine) q.set('mine', '1');
  q.set('days', String(jobFilter.days));
  const r:any = await apiGet(`/api/jobs?${q.toString()}`);
  jobs.value = Array.isArray(r.data) ? r.data : [];
  loadedTabs.jobs = true;
}

async function loadRepairHistory() {
  const r:any = await apiGet('/api/system-tools');
  repairHistory.value = Array.isArray(r.data?.history) ? r.data.history : [];
  loadedTabs.history = true;
  if (!loadedTabs.repair) {
    applySchema(r.data?.schema || {});
    applyDashboard(r.data?.dashboard || {});
    applyScan(r.data?.scan || {});
    loadedTabs.repair = true;
  }
}

async function cleanupJobs() {
  await confirmRiskAction({ title: '自动清理历史任务', actionLabel: '清理异步任务历史', detail: '会清理过期结果、自动取消排队过久的任务，并删除长期无结果的旧任务。', affectedRows: jobs.value.length, irreversible: false });
  const r:any = await apiPut('/api/jobs', { action: 'cleanup' });
  ElMessage.success(r.message || '已自动清理');
  await loadJobs();
}

function buildJobResultUrl(row:any, opts: { inline?: boolean; print?: boolean } = {}) {
  const id = Number(row?.id || 0);
  if (!id) return '';
  const q = new URLSearchParams({ id: String(id) });
  if (opts.inline) q.set('inline', '1');
  if (opts.print) q.set('print', '1');
  return `/api/jobs-download?${q.toString()}`;
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

async function downloadJob(row:any) {
  const url = buildJobResultUrl(row);
  if (!url) return;
  try {
    const file = await downloadJobResultCached(url, row?.result_filename || undefined);
    if (file.fromCache) ElMessage.success('已从最近下载缓存读取结果');
  } catch (e:any) {
    ElMessage.error(e?.message || '下载任务结果失败');
  }
}

async function previewJob(row:any) {
  const url = buildJobResultUrl(row, { inline: true });
  if (!url) return;
  try {
    const file = await openJobResultCached(url, row?.result_filename || undefined);
    if (file.fromCache) ElMessage.success('已从最近预览缓存打开结果');
  } catch (e:any) {
    ElMessage.error(e?.message || '预览任务结果失败');
  }
}

async function printJob(row:any) {
  const url = buildJobResultUrl(row, { inline: true, print: true });
  if (!url) return;
  try {
    const file = await openJobResultCached(url, row?.result_filename || undefined);
    if (file.fromCache) ElMessage.success('已从最近打印缓存打开结果');
  } catch (e:any) {
    ElMessage.error(e?.message || '打开打印页失败');
  }
}

async function retryJob(id:number) {
  await confirmRiskAction({ title: '重试异步任务', actionLabel: '重试失败任务', detail: `任务 #${id} 会重新入队执行。`, irreversible: false });
  const r:any = await apiPut('/api/jobs', { action: 'retry', id });
  ElMessage.success(r.message || '已重试');
  await loadJobs();
}
async function cancelJob(id:number) {
  await confirmRiskAction({ title: '取消异步任务', actionLabel: '取消任务', detail: `任务 #${id} 将被取消或进入取消中状态。`, irreversible: false });
  const r:any = await apiPut('/api/jobs', { action: 'cancel', id });
  ElMessage.success(r.message || '已取消');
  await loadJobs();
}

function openDiff(row:any) {
  diffDialog.title = `${row.label} 差异明细`;
  diffDialog.rows = Array.isArray(row.examples) ? row.examples : [];
  diffDialog.columns = diffDialog.rows.length ? Object.keys(diffDialog.rows[0]) : [];
  diffDialog.visible = true;
}

onMounted(() => { ensureTabLoaded('repair'); });
</script>
