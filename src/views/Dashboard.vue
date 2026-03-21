<template>
  <div class="dashboard-page">
    <el-card class="dashboard-card">
      <template #header>
        <div class="dashboard-header">
          <div class="dashboard-header__left">
            <div class="dashboard-header__title">报表与看板</div>
            <div class="dashboard-header__subline">
              <span>经营 + 治理 + 稳定性统一口径</span>
              <el-tag size="small" :type="scopeTagType">{{ scopeLabel }}</el-tag>
              <el-tag v-if="data?.snapshot?.source" size="small" type="info">日汇总快照 {{ data?.snapshot?.day_count || 0 }} 天</el-tag>
              <span v-if="lastUpdatedLabel" class="dashboard-header__hint">{{ lastUpdatedLabel }}</span>
            </div>
          </div>
          <div class="dashboard-toolbar">
            <el-segmented v-if="reportModeOptions.length" v-model="reportMode" :options="reportModeOptions" size="small" />
            <el-tag v-else type="warning">当前数据范围暂无可用看板</el-tag>
            <el-select v-model="days" class="dashboard-days" :disabled="!reportModeOptions.length">
              <el-option :value="7" label="近 7 天" />
              <el-option :value="14" label="近 14 天" />
              <el-option :value="30" label="近 30 天" />
              <el-option :value="90" label="近 90 天" />
            </el-select>
            <el-button :loading="refreshing" @click="refresh(true)">{{ refreshing ? '刷新中' : '刷新' }}</el-button>
          </div>
        </div>
      </template>

      <div v-if="data" class="dashboard-content" v-loading="refreshing && !isUsingWarmCache" element-loading-text="正在刷新数据…">
        <div :style="{ display: 'grid', gridTemplateColumns: summaryColumns, gap: '12px', marginBottom: '12px' }">
          <el-card shadow="never"><div class="metric-card__label">入库数量</div><div class="metric-card__value">{{ data.summary.in_qty ?? 0 }}</div></el-card>
          <el-card shadow="never"><div class="metric-card__label">出库数量</div><div class="metric-card__value">{{ data.summary.out_qty ?? 0 }}</div></el-card>
          <el-card v-if="reportMode==='parts'" shadow="never"><div class="metric-card__label">调整数量</div><div class="metric-card__value">{{ data.summary.adjust_qty ?? 0 }}</div></el-card>
          <el-card v-if="reportMode==='pc'" shadow="never"><div class="metric-card__label">回收/归还数量</div><div class="metric-card__value">{{ data.summary.recycle_qty ?? 0 }}</div></el-card>
          <el-card v-if="reportMode==='monitor'" shadow="never"><div class="metric-card__label">归还数量</div><div class="metric-card__value">{{ data.summary.return_qty ?? 0 }}</div></el-card>
          <el-card v-if="reportMode==='monitor'" shadow="never"><div class="metric-card__label">调拨数量</div><div class="metric-card__value">{{ data.summary.transfer_qty ?? 0 }}</div></el-card>
          <el-card v-if="reportMode==='pc' || reportMode==='monitor'" shadow="never"><div class="metric-card__label">报废数量</div><div class="metric-card__value">{{ data.summary.scrap_qty ?? 0 }}</div></el-card>
          <el-card shadow="never"><div class="metric-card__label">明细笔数</div><div class="metric-card__value">{{ data.summary.tx_count ?? 0 }}</div></el-card>
        </div>

        <div class="dashboard-grid dashboard-grid--governance">
          <el-card shadow="never">
            <div class="metric-card__label">生命周期治理</div>
            <div class="metric-card__value metric-card__value--mid">{{ governanceArchiveCount }}</div>
            <div class="metric-card__desc">当前归档资产</div>
          </el-card>
          <el-card shadow="never">
            <div class="metric-card__label">生命周期动作</div>
            <div class="metric-card__value metric-card__value--mid">{{ (data.governance?.archive_events_30d ?? 0) + (data.governance?.restore_events_30d ?? 0) + (data.governance?.purge_events_30d ?? 0) }}</div>
            <div class="metric-card__desc">近 {{ days }} 天归档/恢复/清理</div>
          </el-card>
          <el-card shadow="never">
            <div class="metric-card__label">演练闭环</div>
            <div class="metric-card__value metric-card__value--mid">{{ data.stability?.open_drill_issue_count ?? 0 }}</div>
            <div class="metric-card__desc">未闭环演练问题，逾期 {{ data.stability?.overdue_drill_issue_count ?? 0 }}</div>
          </el-card>
          <el-card shadow="never">
            <div class="metric-card__label">稳定性告警</div>
            <div class="metric-card__value metric-card__value--mid">{{ data.stability?.active_alert_count ?? 0 }}</div>
            <div class="metric-card__desc">失败任务 {{ data.stability?.failed_async_jobs ?? 0 }} / 24h 5xx {{ data.stability?.error_5xx_last_24h ?? 0 }}</div>
          </el-card>
        </div>

        <div class="dashboard-grid dashboard-grid--detail">
          <el-card shadow="never">
            <template #header>
              <div class="chart-header">
                <div><b>近 {{ days }} 天{{ activeTypeLabel }}趋势</b><span class="chart-header__range">（{{ data.range.from }} ~ {{ data.range.to }}）</span></div>
                <el-segmented v-model="activeType" :options="typeOptions" size="small" />
              </div>
            </template>
            <div class="chart-list">
              <div v-for="r in seriesFilled" :key="r.day" class="chart-row">
                <div class="chart-row__day">{{ r.day }}</div>
                <div class="chart-row__bar-bg"><div :style="{ width: barWidth(r.qty) }" class="chart-row__bar-fill" /></div>
                <div class="chart-row__qty">{{ r.qty }}</div>
              </div>
            </div>
          </el-card>

          <el-card shadow="never">
            <template #header><b>{{ activeTypeLabel }} Top 10</b></template>
            <el-table :data="topTable" size="small" border height="360">
              <el-table-column prop="sku" :label="reportMode==='parts' ? 'SKU' : '型号'" width="140" />
              <el-table-column prop="name" label="名称" min-width="140" />
              <el-table-column prop="qty" label="数量" width="80" />
            </el-table>
            <div class="dashboard-subtable">
              <b>{{ categoryTitle }}</b>
              <el-table :data="categoryTable" size="small" border height="240" style="margin-top:8px;">
                <el-table-column prop="category" label="分类" min-width="140" />
                <el-table-column prop="qty" label="数量" width="90" />
              </el-table>
            </div>
          </el-card>
        </div>
      </div>

      <div v-else-if="!reportModeOptions.length" class="dashboard-empty">
        <el-empty description="当前账号的数据范围已限制到未接入看板口径的仓域，请联系管理员调整为电脑仓、显示器仓或配件仓，或保留当前账号仅用于台账访问。" />
      </div>
      <div v-else class="dashboard-loading">加载中…</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { ElMessage } from "../utils/el-services";
import { apiGet } from "../api/client";
import { useFixedWarehouseId } from "../utils/warehouse";
import { addDaysYmd } from "../utils/datetime";
import { useAuth } from "../store/auth";
import { dataScopeLabel, scopeModeOptions } from "../utils/dataScope";

const warehouseId = useFixedWarehouseId();
const auth = useAuth();
const days = ref(30);
const reportMode = ref<"parts"|"pc"|"monitor">("parts");
const data = ref<any|null>(null);
const refreshing = ref(false);
const isUsingWarmCache = ref(false);
const cacheStamp = ref(0);
const CACHE_TTL_MS = 45_000;
const dashboardCache = new Map<string, { data: any; fetchedAt: number }>();
const pendingRequests = new Map<string, Promise<any>>();
let activeRequestId = 0;
let activeController: AbortController | null = null;

const reportModeOptions = computed(() => {
  const allowed = scopeModeOptions(auth.user?.data_scope_type, auth.user?.data_scope_value, auth.user?.data_scope_value2);
  return allowed.map((value) => ({ label: value === 'parts' ? '配件仓' : value === 'pc' ? '电脑仓' : '显示器仓', value }));
});
const scopeLabel = computed(() => dataScopeLabel(auth.user?.data_scope_type, auth.user?.data_scope_value, auth.user?.data_scope_value2));
const scopeTagType = computed(() => auth.user?.data_scope_type && auth.user?.data_scope_type !== 'all' ? 'warning' : 'success');

const activeType = ref<string>("OUT");
const typeOptions = computed(() => {
  if (reportMode.value === 'pc') return [{ label: '出库', value: 'OUT' }, { label: '入库', value: 'IN' }, { label: '归还', value: 'RETURN' }, { label: '回收', value: 'RECYCLE' }, { label: '报废', value: 'SCRAP' }];
  if (reportMode.value === 'monitor') return [{ label: '出库', value: 'OUT' }, { label: '入库', value: 'IN' }, { label: '归还', value: 'RETURN' }, { label: '调拨', value: 'TRANSFER' }, { label: '报废', value: 'SCRAP' }];
  return [{ label: '出库', value: 'OUT' }, { label: '入库', value: 'IN' }];
});
const activeTypeLabel = computed(() => ({ OUT:'出库', IN:'入库', RETURN:'归还', RECYCLE:'回收', SCRAP:'报废', TRANSFER: '调拨' } as Record<string,string>)[activeType.value] || activeType.value);
const governanceArchiveCount = computed(() => Number(data.value?.governance?.archived_pc_count || 0) + Number(data.value?.governance?.archived_monitor_count || 0));
const summaryColumns = computed(() => reportMode.value === 'parts' ? 'repeat(4, minmax(0,1fr))' : reportMode.value === 'monitor' ? 'repeat(6, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))');

function buildCacheKey(mode = reportMode.value, dayCount = days.value) {
  return JSON.stringify({
    warehouse_id: warehouseId.value,
    mode,
    days: dayCount,
    data_scope_type: auth.user?.data_scope_type || 'all',
    data_scope_value: auth.user?.data_scope_value || null,
    data_scope_value2: auth.user?.data_scope_value2 || null,
  });
}

function getCachedPayload(mode = reportMode.value, dayCount = days.value) {
  void cacheStamp.value;
  return dashboardCache.get(buildCacheKey(mode, dayCount)) || null;
}

function isCacheFresh(mode = reportMode.value, dayCount = days.value) {
  const cached = getCachedPayload(mode, dayCount);
  return !!cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS;
}

function pickByType(prefix: string, t: string) {
  const key = `${prefix}_${String(t || '').toLowerCase()}`;
  return data.value?.[key] || [];
}

const topTable = computed(() => !data.value ? [] : pickByType('top', activeType.value));
const categoryTable = computed(() => !data.value ? [] : pickByType('category', activeType.value));
const categoryTitle = computed(() => {
  if (reportMode.value === 'parts') return `按分类${activeTypeLabel.value}`;
  if (reportMode.value === 'monitor') {
    if (activeType.value === 'OUT') return '按部门出库';
    if (activeType.value === 'IN') return '按品牌入库';
    if (activeType.value === 'RETURN') return '按部门归还';
    if (activeType.value === 'TRANSFER') return '按部门调拨';
    if (activeType.value === 'SCRAP') return '按报废原因';
    return '分类';
  }
  if (activeType.value === 'OUT') return '按部门出库';
  if (activeType.value === 'IN') return '按品牌入库';
  if (activeType.value === 'RETURN') return '按部门归还';
  if (activeType.value === 'RECYCLE') return '按部门回收';
  if (activeType.value === 'SCRAP') return '按报废原因';
  return '分类';
});
const lastUpdatedLabel = computed(() => {
  const cached = getCachedPayload();
  if (!cached?.fetchedAt) return '';
  const dt = new Date(cached.fetchedAt);
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `最近更新 ${hh}:${mm}:${ss}`;
});

function normalizeErrorMessage(message?: string) {
  const raw = String(message || '').trim();
  if (!raw) return '加载报表失败';
  if (raw.startsWith('<!DOCTYPE') || raw.startsWith('<html')) return '报表接口执行超限，请刷新后重试；本次已修复快照循环问题，重新部署后应恢复正常。';
  return raw;
}

async function fetchDashboard(mode = reportMode.value, dayCount = days.value, force = false, signal?: AbortSignal) {
  const cacheKey = buildCacheKey(mode, dayCount);
  if (!force) {
    const pending = pendingRequests.get(cacheKey);
    if (pending) return pending;
  }
  const url = `/api/reports/summary?warehouse_id=${warehouseId.value}&days=${dayCount}&mode=${mode}`;
  const requestPromise = apiGet(url, signal ? { signal } : undefined).then((result: any) => {
    dashboardCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    cacheStamp.value += 1;
    return result;
  }).finally(() => {
    pendingRequests.delete(cacheKey);
  });
  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

async function prefetchOtherModes() {
  const candidates = reportModeOptions.value.map((item: any) => item.value).filter((mode: string) => mode !== reportMode.value);
  for (const mode of candidates) {
    if (isCacheFresh(mode, days.value) || pendingRequests.has(buildCacheKey(mode, days.value))) continue;
    fetchDashboard(mode, days.value, false).catch(() => {});
  }
}

async function refresh(force = false) {
  if (!reportModeOptions.value.length) {
    data.value = null;
    return;
  }
  const mode = reportMode.value;
  const dayCount = days.value;
  const cached = getCachedPayload(mode, dayCount);
  isUsingWarmCache.value = !!cached;
  if (cached) data.value = cached.data;
  if (!force && cached && isCacheFresh(mode, dayCount)) {
    refreshing.value = false;
    prefetchOtherModes();
    return;
  }

  activeRequestId += 1;
  const requestId = activeRequestId;
  if (activeController) activeController.abort();
  activeController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  refreshing.value = true;
  try {
    const result = await fetchDashboard(mode, dayCount, force, activeController?.signal);
    if (requestId !== activeRequestId) return;
    data.value = result;
    isUsingWarmCache.value = false;
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    ElMessage.error(normalizeErrorMessage(e.message));
  } finally {
    if (requestId === activeRequestId) refreshing.value = false;
    prefetchOtherModes();
  }
}

const seriesFilled = computed(() => {
  if (!data.value) return [];
  const raw = pickByType('daily', activeType.value);
  const map = new Map<string, number>();
  for (const r of raw) map.set(r.day, Number(r.qty));
  const out: any[] = [];
  const to = String(data.value.range.to || "");
  const from = String(data.value.range.from || "");
  if (!from || !to) return raw;
  let cur = from;
  while (cur <= to) {
    out.push({ day: cur, qty: map.get(cur) ?? 0 });
    cur = addDaysYmd(cur, 1);
  }
  return out;
});

function barWidth(qty: number) {
  const max = Math.max(...seriesFilled.value.map((x: any) => x.qty), 1);
  const pct = Math.round((qty / max) * 100);
  return `${pct}%`;
}

watch(reportModeOptions, (opts) => {
  const allowed = opts.map((x: any) => x.value);
  if (!allowed.length) {
    data.value = null;
    return;
  }
  if (!allowed.includes(reportMode.value)) reportMode.value = allowed[0] || 'pc';
}, { immediate: true });

watch([reportMode, days, () => warehouseId.value], () => {
  refresh(false);
});

watch(reportMode, () => {
  const allowed = typeOptions.value.map((x: any) => x.value);
  if (!allowed.includes(activeType.value)) activeType.value = 'OUT';
});

onMounted(async () => {
  const allowed = reportModeOptions.value.map((x: any) => x.value);
  if (allowed.length === 1) reportMode.value = allowed[0];
  await refresh(false);
});
</script>

<style scoped>
.dashboard-page {
  padding: 16px;
}

.dashboard-card {
  border-radius: 18px;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.dashboard-header__left {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dashboard-header__title {
  font-size: 26px;
  font-weight: 700;
  color: #1f2329;
}

.dashboard-header__subline {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  color: #8c8f97;
  font-size: 12px;
}

.dashboard-header__hint {
  color: #5b6472;
}

.dashboard-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.dashboard-days {
  width: 160px;
}

.dashboard-content {
  min-height: 560px;
}

.dashboard-grid {
  display: grid;
  gap: 12px;
}

.dashboard-grid--governance {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 12px;
}

.dashboard-grid--detail {
  grid-template-columns: 1.1fr 0.9fr;
}

.metric-card__label {
  color: #999;
  font-size: 12px;
}

.metric-card__value {
  font-size: 26px;
  font-weight: 700;
  color: #1f2329;
}

.metric-card__value--mid {
  font-size: 22px;
}

.metric-card__desc {
  font-size: 12px;
  color: #888;
  margin-top: 6px;
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.chart-header__range {
  color: #999;
  font-size: 12px;
}

.chart-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chart-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chart-row__day {
  width: 96px;
  color: #666;
  font-size: 12px;
}

.chart-row__bar-bg {
  flex: 1;
  background: #f2f3f5;
  height: 10px;
  border-radius: 6px;
  overflow: hidden;
}

.chart-row__bar-fill {
  height: 10px;
  background: #409eff;
}

.chart-row__qty {
  width: 60px;
  text-align: right;
  color: #333;
  font-size: 12px;
}

.dashboard-subtable {
  margin-top: 10px;
}

.dashboard-empty,
.dashboard-loading {
  padding: 16px;
}

.dashboard-loading {
  color: #999;
}

@media (max-width: 1200px) {
  .dashboard-grid--governance,
  .dashboard-grid--detail {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .dashboard-page {
    padding: 12px;
  }

  .dashboard-header__title {
    font-size: 22px;
  }

  .dashboard-days {
    width: 132px;
  }
}
</style>
