<template>
  <el-card>
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; flex-wrap:wrap">
      <div>
        <div style="font-weight:700">运维工具</div>
        <div style="color:#999; font-size:12px">数据修复中心、异步任务中心、性能与错误观测</div>
      </div>
      <el-button @click="reloadAll">刷新</el-button>
    </div>

    <el-row :gutter="12" style="margin-bottom:12px">
      <el-col :span="8"><el-card shadow="never"><div>慢请求</div><div style="font-size:28px; font-weight:700">{{ dashboard.slow_request_count }}</div></el-card></el-col>
      <el-col :span="8"><el-card shadow="never"><div>错误请求</div><div style="font-size:28px; font-weight:700">{{ dashboard.error_request_count }}</div></el-card></el-col>
      <el-col :span="8"><el-card shadow="never"><div>异步任务</div><div style="font-size:28px; font-weight:700">{{ dashboard.async_job_count }}</div></el-card></el-col>
    </el-row>

    <el-tabs v-model="tab">
      <el-tab-pane label="修复中心" name="repair">
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px">
          <el-button type="primary" :loading="running==='repair_all'" @click="runRepair('repair_all')">一键全量修复</el-button>
          <el-button :loading="running==='repair_pc_latest_state'" @click="runRepair('repair_pc_latest_state')">重建电脑快照</el-button>
          <el-button :loading="running==='repair_dictionary_counters'" @click="runRepair('repair_dictionary_counters')">重算字典引用</el-button>
          <el-button :loading="running==='repair_audit_materialized'" @click="runRepair('repair_audit_materialized')">回填审计物化</el-button>
          <el-button :loading="running==='repair_search_norm'" @click="runRepair('repair_search_norm')">重建搜索规范化</el-button>
        </div>
        <el-alert v-if="lastRepair" type="success" :closable="false" :title="lastRepair" />
      </el-tab-pane>
      <el-tab-pane label="异步任务" name="jobs">
        <el-table :data="jobs" border>
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column prop="job_type" label="任务类型" min-width="180" />
          <el-table-column prop="status" label="状态" width="120" />
          <el-table-column prop="created_by_name" label="创建人" width="120" />
          <el-table-column prop="message" label="结果" min-width="220" />
          <el-table-column prop="created_at" label="创建时间" width="180" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button v-if="row.status==='success'" link type="primary" @click="downloadJob(row.id)">下载</el-button>
              <span v-else style="color:#999">-</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="观测中心" name="obs">
        <div style="font-weight:700; margin-bottom:8px">慢请求</div>
        <el-table :data="slowRows" border size="small" style="margin-bottom:16px">
          <el-table-column prop="created_at" label="时间" width="180" />
          <el-table-column prop="method" label="方法" width="90" />
          <el-table-column prop="path" label="路径" min-width="260" />
          <el-table-column prop="status" label="状态" width="90" />
          <el-table-column prop="total_ms" label="总耗时(ms)" width="120" />
          <el-table-column prop="sql_ms" label="SQL(ms)" width="100" />
        </el-table>
        <div style="font-weight:700; margin-bottom:8px">错误请求</div>
        <el-table :data="errorRows" border size="small">
          <el-table-column prop="created_at" label="时间" width="180" />
          <el-table-column prop="method" label="方法" width="90" />
          <el-table-column prop="path" label="路径" min-width="260" />
          <el-table-column prop="status" label="状态" width="90" />
          <el-table-column prop="total_ms" label="总耗时(ms)" width="120" />
          <el-table-column prop="sql_ms" label="SQL(ms)" width="100" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { apiGet, apiPost, apiDownload } from '../api/client';

type JobRow = { id:number; job_type:string; status:string; created_by_name?:string; message?:string; created_at?:string };
const tab = ref('repair');
const dashboard = reactive({ slow_request_count: 0, error_request_count: 0, async_job_count: 0 });
const jobs = ref<JobRow[]>([]);
const slowRows = ref<any[]>([]);
const errorRows = ref<any[]>([]);
const running = ref('');
const lastRepair = ref('');

async function loadSummary() {
  const r:any = await apiGet('/api/system-tools');
  Object.assign(dashboard, r.data?.dashboard || {});
  jobs.value = r.data?.jobs || [];
}
async function loadObs() {
  const r:any = await apiGet('/api/system-observability?limit=30');
  slowRows.value = r.data?.slow_requests || [];
  errorRows.value = r.data?.error_requests || [];
}
async function reloadAll() {
  await Promise.all([loadSummary(), loadObs()]);
}
async function runRepair(action: string) {
  try {
    running.value = action;
    const r:any = await apiPost('/api/system-tools', { action });
    lastRepair.value = `${action} 已完成：${JSON.stringify(r.data || {})}`;
    ElMessage.success('修复已完成');
    await reloadAll();
  } catch (e:any) {
    ElMessage.error(e?.message || '执行失败');
  } finally {
    running.value = '';
  }
}
async function downloadJob(id:number) {
  try {
    await apiDownload(`/api/jobs-download?id=${id}`);
  } catch (e:any) {
    ElMessage.error(e?.message || '下载失败');
  }
}

onMounted(reloadAll);
</script>
