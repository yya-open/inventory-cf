<template>
  <el-card shadow="never">
    <template #header>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">
        <div>
          <div style="font-size:18px; font-weight:700">性能面板</div>
          <div style="color:#909399; font-size:12px; margin-top:4px">查看最近慢请求、错误路径与接口 P95，定位真正的性能瓶颈。</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
          <el-select v-model="days" style="width:150px" @change="load(false)">
            <el-option label="最近 1 天" :value="1" />
            <el-option label="最近 7 天" :value="7" />
            <el-option label="最近 30 天" :value="30" />
          </el-select>
          <el-button :loading="loading" @click="load(true)">刷新</el-button>
        </div>
      </div>
    </template>

    <el-alert
      v-if="loadError"
      type="error"
      show-icon
      :closable="false"
      :title="loadError"
      style="margin-bottom:12px"
    />

    <div v-loading="loading">
      <template v-if="ready">
        <el-row :gutter="12" style="margin-bottom:12px">
          <el-col :xs="12" :sm="8" :md="6" :lg="4"><el-card shadow="never"><div>慢请求样本</div><div style="font-size:28px; font-weight:700">{{ perf.summary.slow_count }}</div></el-card></el-col>
          <el-col :xs="12" :sm="8" :md="6" :lg="4"><el-card shadow="never"><div>P95</div><div style="font-size:28px; font-weight:700">{{ perf.summary.p95_total_ms }}ms</div></el-card></el-col>
          <el-col :xs="12" :sm="8" :md="6" :lg="4"><el-card shadow="never"><div>P99</div><div style="font-size:28px; font-weight:700">{{ perf.summary.p99_total_ms }}ms</div></el-card></el-col>
          <el-col :xs="12" :sm="8" :md="6" :lg="4"><el-card shadow="never"><div>平均 SQL</div><div style="font-size:28px; font-weight:700">{{ perf.summary.avg_sql_ms }}ms</div></el-card></el-col>
          <el-col :xs="12" :sm="8" :md="6" :lg="4"><el-card shadow="never"><div>4xx</div><div style="font-size:28px; font-weight:700">{{ perf.summary.error_4xx }}</div></el-card></el-col>
          <el-col :xs="12" :sm="8" :md="6" :lg="4"><el-card shadow="never"><div>5xx</div><div style="font-size:28px; font-weight:700">{{ perf.summary.error_5xx }}</div></el-card></el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :xs="24" :xl="12">
            <el-card shadow="never">
              <template #header><div style="font-weight:700">最慢接口 Top 20</div></template>
              <el-table :data="perf.top_slow_paths" border size="small" height="420" empty-text="暂无慢请求数据">
                <el-table-column prop="path" label="路径" min-width="260" />
                <el-table-column prop="hit_count" label="次数" width="90" />
                <el-table-column prop="avg_total_ms" label="平均耗时(ms)" width="130" />
                <el-table-column prop="max_total_ms" label="最大耗时(ms)" width="130" />
                <el-table-column prop="avg_sql_ms" label="平均SQL(ms)" width="120" />
              </el-table>
            </el-card>
          </el-col>
          <el-col :xs="24" :xl="12">
            <el-card shadow="never">
              <template #header><div style="font-weight:700">错误路径 Top 20</div></template>
              <el-table :data="perf.top_error_paths" border size="small" height="420" empty-text="暂无错误请求数据">
                <el-table-column prop="path" label="路径" min-width="280" />
                <el-table-column prop="status" label="状态" width="100" />
                <el-table-column prop="hit_count" label="次数" width="100" />
              </el-table>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="12" style="margin-top:12px">
          <el-col :xs="24" :xl="12">
            <el-card shadow="never">
              <template #header><div style="font-weight:700">最近慢请求</div></template>
              <el-table :data="perf.recent_slow_requests" border size="small" height="420" empty-text="暂无慢请求数据">
                <el-table-column prop="created_at" label="时间" width="180" />
                <el-table-column prop="method" label="方法" width="90" />
                <el-table-column prop="path" label="路径" min-width="260" />
                <el-table-column prop="status" label="状态" width="90" />
                <el-table-column prop="total_ms" label="总耗时(ms)" width="120" />
                <el-table-column prop="sql_ms" label="SQL(ms)" width="100" />
              </el-table>
            </el-card>
          </el-col>
          <el-col :xs="24" :xl="12">
            <el-card shadow="never">
              <template #header><div style="font-weight:700">最近错误请求</div></template>
              <el-table :data="perf.recent_error_requests" border size="small" height="420" empty-text="暂无错误请求数据">
                <el-table-column prop="created_at" label="时间" width="180" />
                <el-table-column prop="method" label="方法" width="90" />
                <el-table-column prop="path" label="路径" min-width="260" />
                <el-table-column prop="status" label="状态" width="90" />
                <el-table-column prop="total_ms" label="总耗时(ms)" width="120" />
                <el-table-column prop="sql_ms" label="SQL(ms)" width="100" />
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </template>

      <el-empty v-else-if="!loading" description="暂无性能数据" />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from '../utils/el-services';
import { getSystemPerformance } from '../api/systemPerformance';

type PerfData = {
  summary: {
    slow_count: number;
    p95_total_ms: number;
    p99_total_ms: number;
    avg_sql_ms: number;
    error_4xx: number;
    error_5xx: number;
  };
  top_slow_paths: any[];
  top_error_paths: any[];
  recent_slow_requests: any[];
  recent_error_requests: any[];
};

function emptyPerf(): PerfData {
  return {
    summary: {
      slow_count: 0,
      p95_total_ms: 0,
      p99_total_ms: 0,
      avg_sql_ms: 0,
      error_4xx: 0,
      error_5xx: 0,
    },
    top_slow_paths: [],
    top_error_paths: [],
    recent_slow_requests: [],
    recent_error_requests: [],
  };
}

const days = ref(7);
const loading = ref(false);
const ready = ref(false);
const loadError = ref('');
const perf = reactive<PerfData>(emptyPerf());

function resetPerf() {
  Object.assign(perf, emptyPerf());
}

async function load(force = false) {
  loading.value = true;
  loadError.value = '';
  try {
    const response: any = await getSystemPerformance(days.value, { force });
    const payload = response?.data && typeof response.data === 'object' ? response.data : {};
    resetPerf();
    Object.assign(perf.summary, payload.summary || {});
    perf.top_slow_paths = Array.isArray(payload.top_slow_paths) ? payload.top_slow_paths : [];
    perf.top_error_paths = Array.isArray(payload.top_error_paths) ? payload.top_error_paths : [];
    perf.recent_slow_requests = Array.isArray(payload.recent_slow_requests) ? payload.recent_slow_requests : [];
    perf.recent_error_requests = Array.isArray(payload.recent_error_requests) ? payload.recent_error_requests : [];
    ready.value = true;
  } catch (e: any) {
    resetPerf();
    ready.value = false;
    loadError.value = e?.message || '加载性能面板失败';
    ElMessage.error(loadError.value);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  ready.value = true;
  load(false);
});
</script>
