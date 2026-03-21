<template>
  <el-card>
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px">
      <div>
        <div style="font-weight:700">性能面板</div>
        <div style="color:#999; font-size:12px">查看最近慢请求、错误路径与接口 P95，定位真正的性能瓶颈。</div>
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

    <el-row :gutter="12" style="margin-bottom:12px">
      <el-col :span="4"><el-card shadow="never"><div>慢请求样本</div><div style="font-size:28px; font-weight:700">{{ data.summary?.slow_count || 0 }}</div></el-card></el-col>
      <el-col :span="4"><el-card shadow="never"><div>P95</div><div style="font-size:28px; font-weight:700">{{ data.summary?.p95_total_ms || 0 }}ms</div></el-card></el-col>
      <el-col :span="4"><el-card shadow="never"><div>P99</div><div style="font-size:28px; font-weight:700">{{ data.summary?.p99_total_ms || 0 }}ms</div></el-card></el-col>
      <el-col :span="4"><el-card shadow="never"><div>平均 SQL</div><div style="font-size:28px; font-weight:700">{{ data.summary?.avg_sql_ms || 0 }}ms</div></el-card></el-col>
      <el-col :span="4"><el-card shadow="never"><div>4xx</div><div style="font-size:28px; font-weight:700">{{ data.summary?.error_4xx || 0 }}</div></el-card></el-col>
      <el-col :span="4"><el-card shadow="never"><div>5xx</div><div style="font-size:28px; font-weight:700">{{ data.summary?.error_5xx || 0 }}</div></el-card></el-col>
    </el-row>

    <el-row :gutter="12">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><div style="font-weight:700">最慢接口 Top 20</div></template>
          <el-table :data="data.top_slow_paths || []" border size="small" height="420">
            <el-table-column prop="path" label="路径" min-width="260" />
            <el-table-column prop="hit_count" label="次数" width="90" />
            <el-table-column prop="avg_total_ms" label="平均耗时(ms)" width="130" />
            <el-table-column prop="max_total_ms" label="最大耗时(ms)" width="130" />
            <el-table-column prop="avg_sql_ms" label="平均SQL(ms)" width="120" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><div style="font-weight:700">错误路径 Top 20</div></template>
          <el-table :data="data.top_error_paths || []" border size="small" height="420">
            <el-table-column prop="path" label="路径" min-width="280" />
            <el-table-column prop="status" label="状态" width="100" />
            <el-table-column prop="hit_count" label="次数" width="100" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="12" style="margin-top:12px">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><div style="font-weight:700">最近慢请求</div></template>
          <el-table :data="data.recent_slow_requests || []" border size="small" height="420">
            <el-table-column prop="created_at" label="时间" width="180" />
            <el-table-column prop="method" label="方法" width="90" />
            <el-table-column prop="path" label="路径" min-width="260" />
            <el-table-column prop="status" label="状态" width="90" />
            <el-table-column prop="total_ms" label="总耗时(ms)" width="120" />
            <el-table-column prop="sql_ms" label="SQL(ms)" width="100" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><div style="font-weight:700">最近错误请求</div></template>
          <el-table :data="data.recent_error_requests || []" border size="small" height="420">
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
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from '../utils/el-services';
import { getSystemPerformance } from '../api/systemPerformance';

const days = ref(7);
const loading = ref(false);
const data = reactive<any>({ summary: {}, top_slow_paths: [], top_error_paths: [], recent_slow_requests: [], recent_error_requests: [] });

async function load(force = false) {
  loading.value = true;
  try {
    const r:any = await getSystemPerformance(days.value, { force });
    Object.assign(data, { summary: {}, top_slow_paths: [], top_error_paths: [], recent_slow_requests: [], recent_error_requests: [] }, r.data || {});
  } catch (e:any) {
    ElMessage.error(e.message || '加载性能面板失败');
  } finally {
    loading.value = false;
  }
}

onMounted(() => load(false));
</script>
