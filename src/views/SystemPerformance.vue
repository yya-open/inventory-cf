<template>
  <el-card shadow="never">
    <template #header>
      <div class="sys-header-row">
        <div>
          <div class="sys-header-title">性能与可观测性面板</div>
          <div class="sys-header-muted">查看接口慢请求、浏览器路由性能、交互热点与日志保留策略。</div>
        </div>
        <div class="sys-actions-row">
          <el-select v-model="days" class="sys-w-150" @change="handleRangeChange">
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
      class="sys-card-gap"
    />

    <div v-if="loading && !hasLoadedOnce" class="perf-loading-wrap">
      <el-skeleton :rows="8" animated />
    </div>

    <template v-else>
      <el-row :gutter="12" class="sys-card-gap">
        <el-col :xs="12" :sm="8" :md="6" :lg="4"><el-card shadow="never"><div class="sys-metric-label">慢请求样本</div><div class="sys-metric-value">{{ perf.summary.slow_count }}</div></el-card></el-col>
        <el-col :xs="12" :sm="8" :md="6" :lg="4"><el-card shadow="never"><div class="sys-metric-label">接口 P95</div><div class="sys-metric-value">{{ perf.summary.p95_total_ms }}ms</div></el-card></el-col>
        <el-col :xs="12" :sm="8" :md="6" :lg="4"><el-card shadow="never"><div class="sys-metric-label">接口 P99</div><div class="sys-metric-value">{{ perf.summary.p99_total_ms }}ms</div></el-card></el-col>
        <el-col :xs="12" :sm="8" :md="6" :lg="4"><el-card shadow="never"><div class="sys-metric-label">浏览器慢路由</div><div class="sys-metric-value">{{ perf.browser_summary.slow_route_count }}</div></el-card></el-col>
        <el-col :xs="12" :sm="8" :md="6" :lg="4"><el-card shadow="never"><div class="sys-metric-label">浏览器 P95</div><div class="sys-metric-value">{{ perf.browser_summary.p95_duration_ms }}ms</div></el-card></el-col>
        <el-col :xs="12" :sm="8" :md="6" :lg="4"><el-card shadow="never"><div class="sys-metric-label">4xx / 5xx</div><div class="sys-metric-value">{{ perf.summary.error_4xx }} / {{ perf.summary.error_5xx }}</div></el-card></el-col>
      </el-row>

      <el-row :gutter="12">
        <el-col :xs="24">
          <el-card shadow="never">
            <template #header><div class="sys-title-strong">核心接口基线（P50 / P95）</div></template>
            <el-table :data="perf.endpoint_baselines" border size="small" empty-text="暂无接口基线数据">
              <el-table-column prop="endpoint" label="接口" min-width="180" />
              <el-table-column prop="request_count" label="样本数" width="100" />
              <el-table-column prop="p50_total_ms" label="P50(ms)" width="110" />
              <el-table-column prop="p95_total_ms" label="P95(ms)" width="110" />
              <el-table-column prop="p99_total_ms" label="P99(ms)" width="110" />
              <el-table-column prop="avg_total_ms" label="平均(ms)" width="110" />
              <el-table-column prop="error_5xx_count" label="5xx" width="90" />
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="12" class="perf-row-gap-top">
        <el-col :xs="24" :xl="12">
          <el-card shadow="never">
            <template #header><div class="sys-title-strong">最慢接口 Top 20</div></template>
            <el-table :data="perf.top_slow_paths" border size="small" height="360" empty-text="暂无慢请求数据">
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
            <template #header><div class="sys-title-strong">浏览器慢路由 Top 15</div></template>
            <el-table :data="perf.browser_top_routes" border size="small" height="360" empty-text="暂无浏览器路由数据">
              <el-table-column prop="path" label="路径" min-width="240" />
              <el-table-column prop="hit_count" label="次数" width="90" />
              <el-table-column prop="avg_duration_ms" label="平均耗时(ms)" width="130" />
              <el-table-column prop="max_duration_ms" label="最大耗时(ms)" width="130" />
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="12" class="perf-row-gap-top">
        <el-col :xs="24" :xl="12">
          <el-card shadow="never">
            <template #header><div class="sys-title-strong">错误路径 Top 20</div></template>
            <el-table :data="perf.top_error_paths" border size="small" height="320" empty-text="暂无错误请求数据">
              <el-table-column prop="path" label="路径" min-width="280" />
              <el-table-column prop="status" label="状态" width="100" />
              <el-table-column prop="hit_count" label="次数" width="100" />
            </el-table>
          </el-card>
        </el-col>
        <el-col :xs="24" :xl="12">
          <el-card shadow="never">
            <template #header><div class="sys-title-strong">交互热点 Top 15</div></template>
            <el-table :data="perf.browser_top_events" border size="small" height="320" empty-text="暂无交互埋点数据">
              <el-table-column prop="event_name" label="事件名" min-width="220" />
              <el-table-column prop="hit_count" label="次数" width="100" />
              <el-table-column prop="path_count" label="涉及路径" width="120" />
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="12" class="perf-row-gap-top">
        <el-col :xs="24" :xl="12">
          <el-card shadow="never">
            <template #header><div class="sys-title-strong">最近浏览器慢路由</div></template>
            <el-table :data="perf.browser_recent_routes" border size="small" height="360" empty-text="暂无浏览器路由数据">
              <el-table-column prop="created_at" label="时间" width="180" />
              <el-table-column prop="path" label="路径" min-width="220" />
              <el-table-column prop="duration_ms" label="耗时(ms)" width="110" />
              <el-table-column prop="username" label="用户" width="110" />
            </el-table>
          </el-card>
        </el-col>
        <el-col :xs="24" :xl="12">
          <el-card shadow="never">
            <template #header><div class="sys-title-strong">最近交互事件</div></template>
            <el-table :data="perf.browser_recent_events" border size="small" height="360" empty-text="暂无交互埋点数据">
              <el-table-column prop="created_at" label="时间" width="180" />
              <el-table-column prop="event_name" label="事件" min-width="180" />
              <el-table-column prop="path" label="路径" min-width="180" />
              <el-table-column label="元数据" width="160">
                <template #default="scope">
                  <span>{{ formatMetadata(scope.row.metadata) }}</span>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="12" class="perf-row-gap-top">
        <el-col :xs="24" :xl="12">
          <el-card shadow="never">
            <template #header><div class="sys-title-strong">最近慢请求</div></template>
            <el-table :data="perf.recent_slow_requests" border size="small" height="360" empty-text="暂无慢请求数据">
              <el-table-column prop="created_at" label="时间" width="180" />
              <el-table-column prop="method" label="方法" width="90" />
              <el-table-column prop="path" label="路径" min-width="220" />
              <el-table-column prop="status" label="状态" width="90" />
              <el-table-column prop="total_ms" label="总耗时(ms)" width="120" />
            </el-table>
          </el-card>
        </el-col>
        <el-col :xs="24" :xl="12">
          <el-card shadow="never">
            <template #header><div class="sys-title-strong">最近错误请求</div></template>
            <el-table :data="perf.recent_error_requests" border size="small" height="360" empty-text="暂无错误请求数据">
              <el-table-column prop="created_at" label="时间" width="180" />
              <el-table-column prop="method" label="方法" width="90" />
              <el-table-column prop="path" label="路径" min-width="220" />
              <el-table-column prop="status" label="状态" width="90" />
              <el-table-column prop="total_ms" label="总耗时(ms)" width="120" />
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="12" class="perf-row-gap-top">
        <el-col :xs="24" :xl="12">
          <el-card shadow="never">
            <template #header><div class="sys-title-strong">浏览器趋势（最近 14 个采样日）</div></template>
            <el-table :data="perf.daily_browser_trend" border size="small" height="300" empty-text="暂无浏览器趋势数据">
              <el-table-column prop="day" label="日期" width="130" />
              <el-table-column prop="route_count" label="路由样本" width="100" />
              <el-table-column prop="avg_duration_ms" label="平均耗时(ms)" width="130" />
              <el-table-column prop="max_duration_ms" label="最大耗时(ms)" width="130" />
            </el-table>
          </el-card>
        </el-col>
        <el-col :xs="24" :xl="12">
          <el-card shadow="never">
            <template #header><div class="sys-title-strong">日志保留与索引建议</div></template>
            <div class="perf-retention-grid">
              <el-card shadow="never"><div>慢请求保留</div><div class="sys-metric-mid">{{ perf.retention_policy.slow_request_days }}天</div></el-card>
              <el-card shadow="never"><div>错误日志保留</div><div class="sys-metric-mid">{{ perf.retention_policy.request_error_days }}天</div></el-card>
              <el-card shadow="never"><div>路由埋点保留</div><div class="sys-metric-mid">{{ perf.retention_policy.browser_perf_days }}天</div></el-card>
              <el-card shadow="never"><div>交互埋点保留</div><div class="sys-metric-mid">{{ perf.retention_policy.browser_event_days }}天</div></el-card>
            </div>
            <el-table :data="perf.index_recommendations" border size="small" height="220" empty-text="暂无索引建议">
              <el-table-column prop="label" label="建议项" min-width="180" />
              <el-table-column prop="status" label="状态" width="110">
                <template #default="scope">
                  <el-tag :type="scope.row.status === 'ready' ? 'success' : 'warning'">{{ scope.row.status === 'ready' ? '已到位' : '建议补充' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="detail" label="说明" min-width="220" />
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <el-empty v-if="showEmpty" description="暂无性能数据" class="perf-row-gap-top" />
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { ElSkeleton } from 'element-plus';
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from '../utils/el-services';
import { getSystemPerformance } from '../api/systemPerformance';

type PerfData = {
  summary: Record<string, number>;
  top_slow_paths: any[];
  top_error_paths: any[];
  recent_slow_requests: any[];
  recent_error_requests: any[];
  browser_summary: Record<string, number>;
  browser_top_routes: any[];
  browser_recent_routes: any[];
  browser_top_events: any[];
  browser_recent_events: any[];
  daily_browser_trend: any[];
  retention_policy: Record<string, number>;
  endpoint_baselines: Array<{
    endpoint: string;
    request_count: number;
    p50_total_ms: number;
    p95_total_ms: number;
    p99_total_ms: number;
    avg_total_ms: number;
    error_5xx_count: number;
  }>;
  index_recommendations: any[];
};

function emptyPerf(): PerfData {
  return {
    summary: { slow_count: 0, p95_total_ms: 0, p99_total_ms: 0, avg_sql_ms: 0, error_4xx: 0, error_5xx: 0 },
    top_slow_paths: [],
    top_error_paths: [],
    recent_slow_requests: [],
    recent_error_requests: [],
    browser_summary: { slow_route_count: 0, p95_duration_ms: 0, p99_duration_ms: 0, avg_duration_ms: 0 },
    browser_top_routes: [],
    browser_recent_routes: [],
    browser_top_events: [],
    browser_recent_events: [],
    daily_browser_trend: [],
    retention_policy: { slow_request_days: 0, request_error_days: 0, browser_perf_days: 0, browser_event_days: 0 },
    endpoint_baselines: [],
    index_recommendations: [],
  };
}

const days = ref(7);
const loading = ref(false);
const hasLoadedOnce = ref(false);
const loadError = ref('');
const perf = ref<PerfData>(emptyPerf());

const showEmpty = computed(() => {
  const data = perf.value;
  return hasLoadedOnce.value
    && !loading.value
    && !loadError.value
    && data.summary.slow_count === 0
    && data.top_slow_paths.length === 0
    && data.top_error_paths.length === 0
    && data.browser_top_routes.length === 0
    && data.browser_top_events.length === 0;
});

function formatMetadata(input: unknown) {
  if (!input || typeof input !== 'object') return '-';
  const entries = Object.entries(input as Record<string, unknown>).slice(0, 2);
  if (!entries.length) return '-';
  return entries.map(([key, value]) => `${key}:${String(value)}`).join(' · ');
}

async function load(force = false) {
  loading.value = true;
  loadError.value = '';
  try {
    const response: any = await getSystemPerformance(days.value, { force });
    const payload = response?.data && typeof response.data === 'object' ? response.data : {};
    const next = emptyPerf();
    next.summary = { ...next.summary, ...(payload.summary && typeof payload.summary === 'object' ? payload.summary : {}) };
    next.top_slow_paths = Array.isArray(payload.top_slow_paths) ? payload.top_slow_paths : [];
    next.top_error_paths = Array.isArray(payload.top_error_paths) ? payload.top_error_paths : [];
    next.recent_slow_requests = Array.isArray(payload.recent_slow_requests) ? payload.recent_slow_requests : [];
    next.recent_error_requests = Array.isArray(payload.recent_error_requests) ? payload.recent_error_requests : [];
    next.browser_summary = { ...next.browser_summary, ...(payload.browser_summary && typeof payload.browser_summary === 'object' ? payload.browser_summary : {}) };
    next.browser_top_routes = Array.isArray(payload.browser_top_routes) ? payload.browser_top_routes : [];
    next.browser_recent_routes = Array.isArray(payload.browser_recent_routes) ? payload.browser_recent_routes : [];
    next.browser_top_events = Array.isArray(payload.browser_top_events) ? payload.browser_top_events : [];
    next.browser_recent_events = Array.isArray(payload.browser_recent_events) ? payload.browser_recent_events : [];
    next.daily_browser_trend = Array.isArray(payload.daily_browser_trend) ? payload.daily_browser_trend : [];
    next.retention_policy = { ...next.retention_policy, ...(payload.retention_policy && typeof payload.retention_policy === 'object' ? payload.retention_policy : {}) };
    next.endpoint_baselines = Array.isArray(payload.endpoint_baselines) ? payload.endpoint_baselines : [];
    next.index_recommendations = Array.isArray(payload.index_recommendations) ? payload.index_recommendations : [];
    perf.value = next;
    hasLoadedOnce.value = true;
  } catch (e: any) {
    console.error('system-performance load failed', e);
    perf.value = emptyPerf();
    hasLoadedOnce.value = true;
    loadError.value = e?.message || '加载性能面板失败';
    ElMessage.error(loadError.value);
  } finally {
    loading.value = false;
  }
}

function handleRangeChange() {
  void load(false);
}

onMounted(() => {
  void load(false);
});
</script>

<style scoped>
.perf-loading-wrap {
  padding: 24px 0;
}

.perf-row-gap-top {
  margin-top: 12px;
}

.perf-retention-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
</style>
