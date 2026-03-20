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
        <el-button @click="reloadAll">刷新</el-button>
      </div>
    </div>

    <el-alert v-if="!schema.ok" type="error" :closable="false" show-icon :title="schema.message || '数据库版本不匹配'" style="margin-bottom:12px" />

    <el-row :gutter="12" style="margin-bottom:12px">
      <el-col :span="6"><el-card shadow="never"><div>慢请求</div><div style="font-size:28px; font-weight:700">{{ dashboard.slow_request_count }}</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><div>错误请求</div><div style="font-size:28px; font-weight:700">{{ dashboard.error_request_count }}</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><div>异步任务</div><div style="font-size:28px; font-weight:700">{{ dashboard.async_job_count }}</div><div style="font-size:12px; color:#999">队列 {{ dashboard.queued_job_count }} / 失败 {{ dashboard.failed_job_count }}</div></el-card></el-col>
      <el-col :span="6"><el-card shadow="never"><div>待处理问题</div><div style="font-size:28px; font-weight:700">{{ dashboard.repair_problem_count }}</div><div style="font-size:12px; color:#999">最近巡检 {{ formatTime(scan.last_scanned_at) || '-' }}</div></el-card></el-col>
    </el-row>

    <el-tabs v-model="tab">
      <el-tab-pane label="修复中心" name="repair">
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px">
          <el-button :loading="scanning" @click="scanAll">先扫描</el-button>
          <el-button type="primary" :loading="running==='repair_all'" :disabled="!schema.ok" @click="runRepair('repair_all')">一键全量修复</el-button>
          <el-button :loading="running==='repair_pc_latest_state'" :disabled="!schema.ok" @click="runRepair('repair_pc_latest_state')">重建电脑快照</el-button>
          <el-button :loading="running==='repair_dictionary_counters'" :disabled="!schema.ok" @click="runRepair('repair_dictionary_counters')">重算字典引用</el-button>
          <el-button :loading="running==='repair_audit_materialized'" :disabled="!schema.ok" @click="runRepair('repair_audit_materialized')">回填审计物化</el-button>
          <el-button :loading="running==='repair_search_norm'" :disabled="!schema.ok" @click="runRepair('repair_search_norm')">重建搜索规范化</el-button>
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
        </el-table>

        <el-alert v-if="lastRepair" type="success" :closable="false" :title="lastRepair" style="margin-top:12px" />
      </el-tab-pane>

      <el-tab-pane label="异步任务" name="jobs">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
          <el-select v-model="jobFilter.status" clearable placeholder="状态" style="width:150px" @change="loadJobs"><el-option label="排队中" value="queued" /><el-option label="执行中" value="running" /><el-option label="成功" value="success" /><el-option label="失败" value="failed" /><el-option label="已取消" value="canceled" /></el-select>
          <el-select v-model="jobFilter.job_type" clearable placeholder="任务类型" style="width:180px" @change="loadJobs"><el-option label="审计导出" value="AUDIT_EXPORT" /><el-option label="报废预警导出" value="PC_AGE_WARNING_EXPORT" /></el-select>
          <el-switch v-model="jobFilter.mine" active-text="仅看我发起" @change="loadJobs" />
          <el-button @click="cleanupJobs">自动清理历史任务</el-button>
        </div>

        <el-table :data="jobs" border>
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="job_type" label="任务类型" min-width="160" />
          <el-table-column prop="status" label="状态" width="100" />
          <el-table-column prop="created_by_name" label="创建人" width="120" />
          <el-table-column prop="message" label="结果/说明" min-width="220" />
          <el-table-column label="重试" width="90"><template #default="{ row }">{{ row.retry_count || 0 }}/{{ row.max_retries || 1 }}</template></el-table-column>
          <el-table-column prop="retain_until" label="保留至" width="180" />
          <el-table-column prop="created_at" label="创建时间" width="180" />
          <el-table-column label="操作" min-width="200"><template #default="{ row }"><div style="display:flex; gap:8px; flex-wrap:wrap"><el-button v-if="row.status==='success'" link type="primary" @click="downloadJob(row.id)">下载</el-button><el-button v-if="['failed','canceled'].includes(row.status)" link type="warning" @click="retryJob(row.id)">重试</el-button><el-button v-if="['queued','running'].includes(row.status)" link type="danger" @click="cancelJob(row.id)">取消</el-button></div></template></el-table-column>
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
    </el-tabs>

    <el-dialog v-model="diffDialog.visible" width="720px" :title="diffDialog.title || '差异明细'">
      <div v-if="!diffDialog.rows.length" style="color:#999">暂无明细</div>
      <el-table v-else :data="diffDialog.rows" border size="small">
        <el-table-column v-for="col in diffDialog.columns" :key="col" :prop="col" :label="columnLabel(col)" min-width="120" />
      </el-table>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from "../utils/el-services";
import { apiGet, apiPost, apiPut, apiDownload } from '../api/client';
import { getSystemHealth } from '../api/systemHealth';

const autoScanMinutes = 15;
type JobRow = { id:number; job_type:string; status:string; created_by_name?:string; message?:string; created_at?:string; retry_count?:number; max_retries?:number; retain_until?:string };
const tab = ref('repair');
const schema = reactive<any>({ ok: true, missing: [] });
const dashboard = reactive<any>({ slow_request_count: 0, error_request_count: 0, async_job_count: 0, queued_job_count: 0, failed_job_count: 0, repair_problem_count: 0 });
const scan = reactive<any>({ total_problem_count: 0, affected_rows: 0, last_scanned_at: '', scan_source: 'fresh', items: [] });
const health = reactive<any>({ schema: { ok: true }, metrics: {}, scan: null });
const slowRows = ref<any[]>([]);
const errorRows = ref<any[]>([]);
const jobs = ref<JobRow[]>([]);
const scanning = ref(false);
const running = ref('');
const lastRepair = ref('');
const jobFilter = reactive({ status: '', job_type: '', mine: false });
const diffDialog = reactive<any>({ visible: false, title: '', rows: [], columns: [] });

function formatTime(v?: string | null) {
  if (!v) return '';
  return String(v).replace('T', ' ').replace(/\.\d+Z?$/, '');
}

function columnLabel(key: string) {
  const map: Record<string, string> = {
    id: 'ID', serial_no: '序列号', brand: '品牌', model: '型号', dictionary_key: '字典类型', label: '字典值', expected: '期望计数', actual: '实际计数', asset_type: '资产类型', code: '编号', action: '动作', entity: '实体', entity_id: '实体ID'
  };
  return map[key] || key;
}

function applySchema(data:any) { Object.assign(schema, data || {}); }
function applyDashboard(data:any) { Object.assign(dashboard, data || {}); }
function applyScan(data:any) { Object.assign(scan, { total_problem_count: 0, affected_rows: 0, items: [], ...data }); }

async function loadBase() {
  const r:any = await apiGet('/api/system-tools');
  applySchema(r.data?.schema || {});
  applyDashboard(r.data?.dashboard || {});
  applyScan(r.data?.scan || {});
  jobs.value = Array.isArray(r.data?.jobs) ? r.data.jobs : [];
}

async function loadObservability() {
  const r:any = await apiGet('/api/system-observability');
  slowRows.value = r.data?.slow_requests || [];
  errorRows.value = r.data?.error_requests || [];
}

async function loadHealth() {
  const r:any = await getSystemHealth({ force: true });
  health.schema = r.data?.schema || { ok: true };
  health.metrics = r.data?.metrics || {};
  health.scan = r.data?.scan || null;
}

async function reloadAll() {
  await Promise.all([loadBase(), loadObservability(), loadHealth()]);
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
  running.value = action;
  try {
    const r:any = await apiPost('/api/system-tools', { action });
    lastRepair.value = r.message || '修复完成';
    if (action === 'repair_all' && r.data?.after) applyScan(r.data.after);
    else await scanAll();
    await Promise.all([loadBase(), loadHealth()]);
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
  const r:any = await apiGet(`/api/jobs?${q.toString()}`);
  jobs.value = Array.isArray(r.data) ? r.data : [];
}

async function cleanupJobs() {
  const r:any = await apiPut('/api/jobs', { action: 'cleanup' });
  ElMessage.success(r.message || '已自动清理');
  await loadJobs();
}

async function downloadJob(id:number) { await apiDownload(`/api/jobs-download?id=${id}`, `job_${id}.csv`); }
async function retryJob(id:number) { const r:any = await apiPut('/api/jobs', { action: 'retry', id }); ElMessage.success(r.message || '已重试'); await loadJobs(); }
async function cancelJob(id:number) { const r:any = await apiPut('/api/jobs', { action: 'cancel', id }); ElMessage.success(r.message || '已取消'); await loadJobs(); }

function openDiff(row:any) {
  diffDialog.title = `${row.label} 差异明细`;
  diffDialog.rows = Array.isArray(row.examples) ? row.examples : [];
  diffDialog.columns = diffDialog.rows.length ? Object.keys(diffDialog.rows[0]) : [];
  diffDialog.visible = true;
}

onMounted(reloadAll);
</script>
