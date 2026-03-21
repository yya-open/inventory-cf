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
              <el-tag v-if="detailRefreshing" size="small" type="warning">明细补载中</el-tag>
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

      <div v-if="data" class="dashboard-content" v-loading="summaryRefreshing && !isUsingWarmCache" element-loading-text="正在刷新摘要…">
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

          <el-card shadow="never" v-loading="detailRefreshing && !isUsingWarmDetailCache" element-loading-text="正在补载明细…">
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
import { ElSegmented } from 'element-plus';
import { ref, computed, onMounted, watch } from "vue";
import { ElMessage } from "../utils/el-services";
import { apiGet } from "../api/client";
import { useFixedWarehouseId } from "../utils/warehouse";
import { addDaysYmd } from "../utils/datetime";
import { useAuth } from "../store/auth";
import { dataScopeLabel, scopeModeOptions } from "../utils/dataScope";

const warehouseId = useFixedWarehouseId();
const auth = useAuth();
const DASHBOARD_PREF_KEY = 'inventory:dashboard:prefs:v1';
const CACHE_TTL_MS = 45_000;
const DETAIL_KEYS = [
  'top_out', 'top_in', 'top_return', 'top_recycle', 'top_transfer', 'top_scrap',
  'category_out', 'category_in', 'category_return', 'category_recycle', 'category_transfer', 'category_scrap',
] as const;

type ReportMode = 'parts' | 'pc' | 'monitor';

const days = ref(30);
const reportMode = ref<ReportMode>('parts');
const data = ref<any | null>(null);
const summaryRefreshing = ref(false);
const detailRefreshing = ref(false);
const refreshing = computed(() => summaryRefreshing.value);
const isUsingWarmCache = ref(false);
const isUsingWarmDetailCache = ref(false);
const summaryCacheStamp = ref(0);
const detailCacheStamp = ref(0);
const summaryCache = new Map<string, { data: any; fetchedAt: number }>();
const detailCache = new Map<string, { data: any; fetchedAt: number }>();
const pendingSummaryRequests = new Map<string, Promise<any>>();
const pendingDetailRequests = new Map<string, Promise<any>>();
let activeSummaryRequestId = 0;
let activeDetailRequestId = 0;
let activeSummaryController: AbortController | null = null;
let activeDetailController: AbortController | null = null;
const prefsReady = ref(false);

const reportModeOptions = computed(() => {
  const allowed = scopeModeOptions(auth.user?.data_scope_type, auth.user?.data_scope_value, auth.user?.data_scope_value2);
  return allowed.map((value) => ({ label: value === 'parts' ? '配件仓' : value === 'pc' ? '电脑仓' : '显示器仓', value }));
});
const scopeLabel = computed(() => dataScopeLabel(auth.user?.data_scope_type, auth.user?.data_scope_value, auth.user?.data_scope_value2));
const scopeTagType = computed(() => auth.user?.data_scope_type && auth.user?.data_scope_type !== 'all' ? 'warning' : 'success');

const activeType = ref<string>('OUT');
const typeOptions = computed(() => {
  if (reportMode.value === 'pc') return [{ label: '出库', value: 'OUT' }, { label: '入库', value: 'IN' }, { label: '归还', value: 'RETURN' }, { label: '回收', value: 'RECYCLE' }, { label: '报废', value: 'SCRAP' }];
  if (reportMode.value === 'monitor') return [{ label: '出库', value: 'OUT' }, { label: '入库', value: 'IN' }, { label: '归还', value: 'RETURN' }, { label: '调拨', value: 'TRANSFER' }, { label: '报废', value: 'SCRAP' }];
  return [{ label: '出库', value: 'OUT' }, { label: '入库', value: 'IN' }];
});
const activeTypeLabel = computed(() => ({ OUT: '出库', IN: '入库', RETURN: '归还', RECYCLE: '回收', SCRAP: '报废', TRANSFER: '调拨' } as Record<string, string>)[activeType.value] || activeType.value);
const governanceArchiveCount = computed(() => Number(data.value?.governance?.archived_pc_count || 0) + Number(data.value?.governance?.archived_monitor_count || 0));
const summaryColumns = computed(() => reportMode.value === 'parts' ? 'repeat(4, minmax(0,1fr))' : reportMode.value === 'monitor' ? 'repeat(6, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))');

function readDashboardPrefs() {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(DASHBOARD_PREF_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const storedDays = Number(parsed?.days || 0);
    if ([7, 14, 30, 90].includes(storedDays)) days.value = storedDays;
  } catch {
    // ignore
  }
}

function writeDashboardPrefs() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DASHBOARD_PREF_KEY, JSON.stringify({ days: days.value }));
  } catch {
    // ignore
  }
}

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

function getCachedSummary(mode = reportMode.value, dayCount = days.value) {
  void summaryCacheStamp.value;
  return summaryCache.get(buildCacheKey(mode, dayCount)) || null;
}

function getCachedDetail(mode = reportMode.value, dayCount = days.value) {
  void detailCacheStamp.value;
  return detailCache.get(buildCacheKey(mode, dayCount)) || null;
}

function isSummaryFresh(mode = reportMode.value, dayCount = days.value) {
  const cached = getCachedSummary(mode, dayCount);
  return !!cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS;
}

function isDetailFresh(mode = reportMode.value, dayCount = days.value) {
  const cached = getCachedDetail(mode, dayCount);
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
  const cached = getCachedSummary();
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

function emptyDetailPayload() {
  return Object.fromEntries(DETAIL_KEYS.map((key) => [key, []]));
}

function mergeDashboardPayload(summary: any, detail?: any) {
  return {
    ...(summary || {}),
    ...emptyDetailPayload(),
    ...(detail || {}),
    mode: summary?.mode || detail?.mode || reportMode.value,
    range: summary?.range || detail?.range || data.value?.range || { from: '', to: '', days: days.value },
    scope: summary?.scope || data.value?.scope || null,
    snapshot: summary?.snapshot || data.value?.snapshot || null,
    summary: summary?.summary || data.value?.summary || {},
    governance: summary?.governance || data.value?.governance || {},
    stability: summary?.stability || data.value?.stability || {},
  };
}

async function fetchSummary(mode = reportMode.value, dayCount = days.value, force = false, signal?: AbortSignal) {
  const cacheKey = buildCacheKey(mode, dayCount);
  if (!force) {
    const pending = pendingSummaryRequests.get(cacheKey);
    if (pending) return pending;
  }
  const url = `/api/reports/summary?warehouse_id=${warehouseId.value}&days=${dayCount}&mode=${mode}`;
  const requestPromise = apiGet(url, signal ? { signal } : undefined).then((result: any) => {
    summaryCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    summaryCacheStamp.value += 1;
    return result;
  }).finally(() => {
    pendingSummaryRequests.delete(cacheKey);
  });
  pendingSummaryRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

async function fetchDetail(mode = reportMode.value, dayCount = days.value, force = false, signal?: AbortSignal) {
  const cacheKey = buildCacheKey(mode, dayCount);
  if (!force) {
    const pending = pendingDetailRequests.get(cacheKey);
    if (pending) return pending;
  }
  const url = `/api/reports/detail?warehouse_id=${warehouseId.value}&days=${dayCount}&mode=${mode}`;
  const requestPromise = apiGet(url, signal ? { signal } : undefined).then((result: any) => {
    detailCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    detailCacheStamp.value += 1;
    return result;
  }).finally(() => {
    pendingDetailRequests.delete(cacheKey);
  });
  pendingDetailRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

async function prefetchOtherModes() {
  const candidates = reportModeOptions.value.map((item: any) => item.value).filter((mode: string) => mode !== reportMode.value);
  for (const mode of candidates) {
    if (isSummaryFresh(mode as ReportMode, days.value) || pendingSummaryRequests.has(buildCacheKey(mode as ReportMode, days.value))) continue;
    fetchSummary(mode as ReportMode, days.value, false).catch(() => {});
  }
}

async function loadDetail(mode = reportMode.value, dayCount = days.value, force = false, silent = false) {
  const currentSelection = mode === reportMode.value && dayCount === days.value;
  const cachedDetail = getCachedDetail(mode, dayCount);
  if (currentSelection) {
    isUsingWarmDetailCache.value = !!cachedDetail;
    if (cachedDetail) {
      const summary = getCachedSummary(mode, dayCount)?.data || data.value;
      data.value = mergeDashboardPayload(summary, cachedDetail.data);
    }
  }
  if (!force && cachedDetail && isDetailFresh(mode, dayCount)) {
    if (currentSelection) detailRefreshing.value = false;
    return cachedDetail.data;
  }

  let requestId = 0;
  let controller: AbortController | undefined;
  if (currentSelection) {
    activeDetailRequestId += 1;
    requestId = activeDetailRequestId;
    if (activeDetailController) activeDetailController.abort();
    activeDetailController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    controller = activeDetailController || undefined;
    detailRefreshing.value = true;
  }

  try {
    const detail = await fetchDetail(mode, dayCount, force, controller?.signal);
    if (!currentSelection) return detail;
    if (requestId !== activeDetailRequestId) return detail;
    if (mode !== reportMode.value || dayCount !== days.value) return detail;
    const summary = getCachedSummary(mode, dayCount)?.data || data.value;
    data.value = mergeDashboardPayload(summary, detail);
    isUsingWarmDetailCache.value = false;
    return detail;
  } catch (e: any) {
    if (e?.name === 'AbortError') return null;
    if (!silent && currentSelection) ElMessage.warning(normalizeErrorMessage(e.message || '看板明细补载失败'));
    return null;
  } finally {
    if (currentSelection && requestId === activeDetailRequestId) detailRefreshing.value = false;
  }
}

async function refresh(force = false) {
  if (!reportModeOptions.value.length) {
    data.value = null;
    return;
  }
  const mode = reportMode.value;
  const dayCount = days.value;
  const cachedSummary = getCachedSummary(mode, dayCount);
  const cachedDetail = getCachedDetail(mode, dayCount);
  isUsingWarmCache.value = !!cachedSummary;
  isUsingWarmDetailCache.value = !!cachedDetail;
  if (cachedSummary) data.value = mergeDashboardPayload(cachedSummary.data, cachedDetail?.data);

  if (!force && cachedSummary && isSummaryFresh(mode, dayCount)) {
    summaryRefreshing.value = false;
    void loadDetail(mode, dayCount, false, true);
    void prefetchOtherModes();
    return;
  }

  activeSummaryRequestId += 1;
  const requestId = activeSummaryRequestId;
  if (activeSummaryController) activeSummaryController.abort();
  activeSummaryController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  summaryRefreshing.value = true;
  try {
    const summary = await fetchSummary(mode, dayCount, force, activeSummaryController?.signal || undefined);
    if (requestId !== activeSummaryRequestId) return;
    if (mode !== reportMode.value || dayCount !== days.value) return;
    data.value = mergeDashboardPayload(summary, cachedDetail?.data);
    isUsingWarmCache.value = false;
    void loadDetail(mode, dayCount, force, true);
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    ElMessage.error(normalizeErrorMessage(e.message));
  } finally {
    if (requestId === activeSummaryRequestId) summaryRefreshing.value = false;
    void prefetchOtherModes();
  }
}

const seriesFilled = computed(() => {
  if (!data.value) return [];
  const raw = pickByType('daily', activeType.value);
  const map = new Map<string, number>();
  for (const r of raw) map.set(r.day, Number(r.qty));
  const out: any[] = [];
  const to = String(data.value.range.to || '');
  const from = String(data.value.range.from || '');
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

watch(days, () => {
  if (!prefsReady.value) return;
  writeDashboardPrefs();
});

watch([reportMode, days, () => warehouseId.value], () => {
  if (!prefsReady.value) return;
  void refresh(false);
});

watch(reportMode, () => {
  const allowed = typeOptions.value.map((x: any) => x.value);
  if (!allowed.includes(activeType.value)) activeType.value = 'OUT';
});

onMounted(async () => {
  readDashboardPrefs();
  const allowed = reportModeOptions.value.map((x: any) => x.value);
  if (allowed.length === 1) reportMode.value = allowed[0];
  prefsReady.value = true;
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
