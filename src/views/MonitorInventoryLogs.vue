<template>
  <div>
    <el-card shadow="never" class="ui-page-card" style="margin-bottom: 12px">
      <div class="ui-toolbar ui-toolbar--ledger">
        <div class="ui-toolbar-main">
          <div class="ui-toolbar-block">
            <div class="ui-toolbar-title">筛选查询</div>
            <div class="ui-toolbar-row">
              <el-select v-model="action" placeholder="动作" clearable class="ui-toolbar-select" @change="onSearch">
                <el-option label="在位(OK)" value="OK" />
                <el-option label="异常(ISSUE)" value="ISSUE" />
              </el-select>

              <el-select v-model="issueType" placeholder="异常类型" clearable class="ui-toolbar-select-wide" @change="onSearch">
                <el-option label="找不到显示器" value="NOT_FOUND" />
                <el-option label="位置不符" value="WRONG_LOCATION" />
                <el-option label="二维码不符" value="WRONG_QR" />
                <el-option label="台账状态不符" value="WRONG_STATUS" />
                <el-option label="设备缺失" value="MISSING" />
                <el-option label="其他原因" value="OTHER" />
              </el-select>

              <div class="ui-toolbar-actions ui-toolbar-actions-inline">
                <el-button type="primary" @click="onSearch">查询</el-button>
                <el-button @click="reset">重置</el-button>
              </div>

              <el-input v-model="keyword" placeholder="关键词（资产编号/SN/品牌/型号/员工/备注…）" clearable class="ui-toolbar-input" @keyup.enter="onSearch" />

              <el-date-picker
                v-model="dateRange"
                type="daterange"
                range-separator="-"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
                class="ui-toolbar-date"
                @change="onSearch"
              />
            </div>
          </div>
        </div>

        <div class="ui-toolbar-side">
          <div class="ui-toolbar-block">
            <div class="ui-toolbar-title">快捷工具</div>
            <div class="ui-toolbar-tool-grid">
              <el-button :disabled="loading" @click="exportCsv">导出</el-button>
              <el-button v-if="isAdmin" type="danger" plain :disabled="loading" @click="deleteSelected">删除选中</el-button>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <div style="margin-bottom: 12px">
      <AssetInventoryBatchPageSection
        kind-label="显示器"
        :inventory-batch="inventoryBatch"
        :current-summary="inventorySummary"
        :current-issue-breakdown="inventoryIssueBreakdown"
        :active-issue-code="action === 'ISSUE' ? issueType : ''"
        :busy="batchBusy"
        :is-admin="isAdmin"
        @start-batch="openStartBatch"
        @close-batch="closeActiveBatch"
        @open-execution="openExecutionMode"
        @open-history="scrollToBatchHistory"
        @jump-logs="scrollToLogs"
      @issue-select="applyIssueCardFilter"
      />
    </div>

    <el-card ref="logsSectionRef" shadow="never">
      <LazyMountBlock title="正在装载显示器盘点记录…" min-height="360px" :delay="0" :idle="false" :viewport="false">
        <LedgerTableSkeleton v-if="initialLoading && !rows.length" :row-count="Math.min(8, Math.max(6, Number(pageSize || 8)))" />
        <el-table v-else v-loading="refreshing || loading" :data="rows" border style="width: 100%" @selection-change="onSelectionChange">
          <el-table-column type="selection" width="45" />
          <el-table-column prop="created_at" label="时间" width="170" />

          <el-table-column label="结果" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.action === 'OK'" type="success">在位</el-tag>
              <el-tag v-else type="danger">异常</el-tag>
            </template>
          </el-table-column>

          <el-table-column label="异常类型" width="140">
            <template #default="{ row }">
              {{ issueTypeText(String(row.issue_type || '')) }}
            </template>
          </el-table-column>
          <el-table-column prop="sn" label="SN" width="150" show-overflow-tooltip />
          <el-table-column prop="asset_code" label="资产编号" width="150" show-overflow-tooltip />
          <el-table-column label="显示器" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.brand }} {{ row.model }}
            </template>
          </el-table-column>
          <el-table-column label="台账状态" width="110">
            <template #default="{ row }">
              {{ statusText(String(row.status || '')) }}
            </template>
          </el-table-column>
          <el-table-column prop="location_name" label="位置" min-width="160" show-overflow-tooltip />
          <el-table-column label="领用信息" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.employee_no || row.employee_name || row.department">
                {{ row.employee_no || '-' }} / {{ row.employee_name || '-' }} / {{ row.department || '-' }}
              </span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="240" show-overflow-tooltip />
          <el-table-column label="操作" min-width="200" fixed="right">
            <template #default="{ row }">
              <div class="log-action-row">
                <el-button link @click="viewLedger(row)">查看台账</el-button>
                <el-button link type="primary" :disabled="String(row?.action || '').toUpperCase() !== 'ISSUE'" @click="handleIssue(row)">去处理</el-button>
                <el-button v-if="isAdmin" type="danger" link @click="deleteOne(row)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div style="display:flex; justify-content: space-between; align-items:center; margin-top: 12px">
          <div style="color:#666">共 {{ total }} 条</div>
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :total="total"
            layout="total, sizes, prev, pager, next, jumper"
            :page-sizes="[20, 50, 100, 200]"
            @current-change="onPageChange"
            @size-change="onPageSizeChange"
          />
        </div>
      </LazyMountBlock>
    </el-card>

    <AssetInventoryBatchCloseDialog
      v-model:visible="closeBatchVisible"
      kind-label="显示器"
      :batch="inventoryBatch.active"
      :summary="batchClosingSummary"
      :issue-breakdown="batchClosingIssueBreakdown"
      :loading="batchBusy"
      @confirm="confirmCloseActiveBatch"
    />

    <AssetInventoryBatchStartDialog
      v-model:visible="startBatchVisible"
      kind-label="显示器"
      :suggested-name="startBatchSuggestedName"
      :loading="batchBusy"
      :preview="startBatchPreview"
      @confirm="confirmStartBatch"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeMount, onMounted, onUnmounted, onActivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from '../utils/el-services';
import { withDestructiveActionFeedback } from '../utils/destructiveAction';
import { apiDownload, apiGet, apiPost } from '../api/client';
import { can } from '../store/auth';
import LazyMountBlock from '../components/LazyMountBlock.vue';
import AssetInventoryBatchPageSection from '../components/assets/AssetInventoryBatchPageSection.vue';
import AssetInventoryBatchCloseDialog from '../components/assets/AssetInventoryBatchCloseDialog.vue';
import AssetInventoryBatchStartDialog from '../components/assets/AssetInventoryBatchStartDialog.vue';
import type { InventoryBatchPayload } from '../api/inventoryBatches';
import { useInventoryBatchStore } from '../composables/useInventoryBatchStore';
import { countMonitorAssets, getMonitorAssetInventorySummary, invalidateAssetInventorySummaryCache } from '../api/assetLedgers';
import type { AssetInventorySummary, InventoryIssueBreakdown, MonitorFilters } from '../types/assets';
import { emptyInventoryIssueBreakdown } from '../types/assets';
import { openMonitorLedgerFromInventoryLog } from '../utils/inventoryLedgerNavigation';
import { createInventoryBatchStartPreview, executeInventoryBatchClose, executeInventoryBatchStart, suggestInventoryBatchName } from '../utils/inventoryBatchPageService';
import { usePagedAssetList } from '../composables/usePagedAssetList';
import { scheduleOnIdle } from '../utils/idle';
import LedgerTableSkeleton from '../components/assets/LedgerTableSkeleton.vue';

function statusText(s: string) {
  if (s === 'IN_STOCK') return '在库';
  if (s === 'ASSIGNED') return '已领用';
  if (s === 'RECYCLED') return '已回收';
  if (s === 'SCRAPPED') return '已报废';
  return s || '-';
}

function issueTypeText(s: string) {
  if (s === 'NOT_FOUND') return '找不到显示器';
  if (s === 'WRONG_LOCATION') return '位置不符';
  if (s === 'WRONG_QR') return '二维码不符';
  if (s === 'WRONG_STATUS') return '台账状态不符';
  if (s === 'MISSING') return '设备缺失';
  if (s === 'OTHER') return '其他原因';
  return s || '-';
}

function buildMonitorBatchExportBaseFilters(): MonitorFilters {
  return {
    status: '',
    locationId: '',
    keyword: '',
    archiveReason: '',
    archiveMode: 'active',
    showArchived: false,
    inventoryStatus: '',
  };
}

const route = useRoute();
const router = useRouter();
const action = ref<string>('');
const issueType = ref<string>('');
const keyword = ref<string>('');
const dateRange = ref<[string, string] | null>(null);
const selectedRows = ref<any[]>([]);
const isAdmin = computed(() => can('admin'));
const SOFT_REFRESH_TTL_MS = 20_000;
let lastRefreshAt = 0;
let cancelPanelRefresh: (() => void) | null = null;
const { payload: inventoryBatch, refresh: refreshInventoryBatchStore, applyPayload: applyInventoryBatchPayload } = useInventoryBatchStore('monitor');
const inventorySummary = ref<AssetInventorySummary>({ total: 0, checked_ok: 0, checked_issue: 0, unchecked: 0 });
const batchBusy = ref(false);
let snapshotPollTimer: ReturnType<typeof window.setInterval> | null = null;
const closeBatchVisible = ref(false);
const startBatchVisible = ref(false);
const startBatchSuggestedName = ref('');
const startBatchPreview = ref({ assetTotal: 0, checkedOk: 0, checkedIssue: 0, unchecked: 0, logTotal: 0, activeName: '' });
const batchClosingSummary = ref<AssetInventorySummary>({ total: 0, checked_ok: 0, checked_issue: 0, unchecked: 0 });
const inventoryIssueBreakdown = ref<InventoryIssueBreakdown>(emptyInventoryIssueBreakdown());
const batchClosingIssueBreakdown = ref<InventoryIssueBreakdown>(emptyInventoryIssueBreakdown());

const hasPendingSnapshotJob = computed(() => [inventoryBatch.value.active, inventoryBatch.value.latest, ...(inventoryBatch.value.recent || [])].some((item) => ['queued', 'running'].includes(String(item?.snapshot_job_status || '').toLowerCase())));
const logsSectionRef = ref<any>(null);

type MonitorInventoryLogFilters = {
  action: string;
  issueType: string;
  keyword: string;
  dateFrom: string;
  dateTo: string;
};

function currentFilters(): MonitorInventoryLogFilters {
  return {
    action: String(action.value || '').trim().toUpperCase(),
    issueType: String(issueType.value || '').trim().toUpperCase(),
    keyword: String(keyword.value || '').trim(),
    dateFrom: String(dateRange.value?.[0] || '').trim(),
    dateTo: String(dateRange.value?.[1] || '').trim(),
  };
}

function filterKey(filters: MonitorInventoryLogFilters) {
  return [filters.action || '', filters.issueType || '', filters.keyword || '', filters.dateFrom || '', filters.dateTo || ''].join('|');
}

function buildParams(filters: MonitorInventoryLogFilters, withPage: boolean, pageNumber = page.value, size = pageSize.value) {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.issueType) params.set('issue_type', filters.issueType);
  if (filters.keyword) params.set('keyword', filters.keyword);
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (withPage) {
    params.set('page', String(pageNumber));
    params.set('page_size', String(size));
  }
  return params;
}

const {
  rows,
  loading,
  refreshing,
  initialLoading,
  page,
  pageSize,
  total,
  load: loadPaged,
  clearTotalCache,
  invalidateCache,
} = usePagedAssetList<MonitorInventoryLogFilters, any>({
  cacheNamespace: 'monitor-inventory-log',
  cacheTtlMs: 45_000,
  totalDebounceMs: 350,
  createFilterKey: filterKey,
  fetchPage: async ({ filters, page, pageSize, fast, signal }) => {
    const params = buildParams(filters, true, page, pageSize);
    if (fast) params.set('fast', '1');
    const r: any = await apiGet(`/api/monitor-inventory-log/list?${params.toString()}`, { signal });
    return {
      rows: Array.isArray(r?.data) ? r.data : [],
      total: typeof r?.total === 'number' ? Number(r.total || 0) : null,
    };
  },
  fetchTotal: async (filters, signal) => {
    const params = buildParams(filters, false);
    const j: any = await apiGet(`/api/monitor-inventory-log-count?${params.toString()}`, { signal });
    return Number(j?.total || 0);
  },
});

function applyRouteFilters() {
  action.value = String(route.query.action || '').trim().toUpperCase();
  issueType.value = String(route.query.issue_type || '').trim().toUpperCase();
  keyword.value = String(route.query.keyword || '').trim();
  const from = String(route.query.date_from || '').trim();
  const to = String(route.query.date_to || '').trim();
  dateRange.value = from || to ? [from, to] as [string, string] : null;
  page.value = 1;
}

async function load(options: { keepPage?: boolean; silent?: boolean; forceRefresh?: boolean } = {}) {
  try {
    await loadPaged(currentFilters(), {
      keepPage: options.keepPage ?? true,
      silent: options.silent,
      forceRefresh: options.forceRefresh,
    });
    lastRefreshAt = Date.now();
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  }
}

function schedulePanelRefresh(timeout = 240) {
  cancelPanelRefresh?.();
  cancelPanelRefresh = scheduleOnIdle(() => {
    void refreshInventoryBatchAndSummary();
  }, timeout);
}

function onSearch() {
  page.value = 1;
  void load();
  schedulePanelRefresh();
}

function reset() {
  action.value = '';
  issueType.value = '';
  keyword.value = '';
  dateRange.value = null;
  page.value = 1;
  clearTotalCache();
  void load({ forceRefresh: true });
  schedulePanelRefresh();
}

async function loadMonitorIssueBreakdown() {
  const codes = ['NOT_FOUND', 'WRONG_LOCATION', 'WRONG_QR', 'WRONG_STATUS', 'MISSING', 'OTHER'] as const;
  const activeBatchId = Number(inventoryBatch.value.active?.id || 0) || 0;
  const batchQuery = activeBatchId > 0 ? `&batch_id=${activeBatchId}` : '';
  const result = await Promise.all(
    codes.map((code) => apiGet(`/api/monitor-inventory-log-count?action=ISSUE&issue_type=${encodeURIComponent(code)}${batchQuery}`).then((res: any) => [code, Number(res?.total || 0)] as const))
  );
  const next = emptyInventoryIssueBreakdown();
  for (const [code, value] of result) next[code] = value;
  return next;
}

async function refreshInventoryBatchAndSummary() {
  invalidateAssetInventorySummaryCache('monitor');
  try {
    const payload = await refreshInventoryBatchStore({ force: true, silent: true, ttlMs: 0 });
    applyInventoryBatchPayload(payload);
  } catch (error) {
    console.warn('monitor inventory batch fetch failed', error);
  }
  const [summaryResult, issueBreakdownResult] = await Promise.allSettled([
    getMonitorAssetInventorySummary(buildMonitorBatchExportBaseFilters(), undefined, { force: true }),
    loadMonitorIssueBreakdown(),
  ]);
  if (summaryResult.status === 'fulfilled') {
    inventorySummary.value = summaryResult.value;
  } else {
    console.warn('monitor inventory summary refresh failed', summaryResult.reason);
  }
  if (issueBreakdownResult.status === 'fulfilled') {
    inventoryIssueBreakdown.value = issueBreakdownResult.value;
  } else {
    console.warn('monitor inventory issue breakdown refresh failed', issueBreakdownResult.reason);
  }
}

function onPageChange() { void load({ keepPage: true }); }
function onPageSizeChange() { page.value = 1; void load({ keepPage: true }); }
function onSelectionChange(list: any[]) { selectedRows.value = list || []; }

function buildIds(list: any[]) {
  return (list || []).map((r: any) => Number(r.id)).filter((n: number) => Number.isFinite(n) && n > 0);
}

async function deleteSelected() {
  if (!isAdmin.value) return;
  const ids = buildIds(selectedRows.value);
  if (!ids.length) return ElMessage.warning('请先勾选要删除的记录');
  try {
    await ElMessageBox.prompt(`请输入「删除」确认操作（将删除选中的 ${ids.length} 条记录）`, '删除确认', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputPlaceholder: '删除',
      inputValidator: (v: string) => (String(v || '').trim() === '删除' ? true : '需要输入「删除」'),
    });
    loading.value = true;
    const r: any = await withDestructiveActionFeedback('正在批量删除显示器盘点记录', () => apiPost('/api/monitor-inventory-log/delete', { ids, confirm: '删除' }));
    ElMessage.success(`已删除 ${Number(r?.data?.deleted || 0)} 条记录`);
    selectedRows.value = [];
    invalidateCache();
    clearTotalCache();
    await load({ forceRefresh: true });
    await refreshInventoryBatchAndSummary();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.message || '删除失败');
  } finally {
    loading.value = false;
  }
}

async function deleteOne(row: any) {
  if (!isAdmin.value) return;
  const id = Number(row?.id || 0);
  if (!id) return;
  try {
    await ElMessageBox.prompt('请输入「删除」确认操作（将删除该条记录）', '删除确认', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputPlaceholder: '删除',
      inputValidator: (v: string) => (String(v || '').trim() === '删除' ? true : '需要输入「删除」'),
    });
    loading.value = true;
    const r: any = await apiPost('/api/monitor-inventory-log/delete', { ids: [id], confirm: '删除' });
    ElMessage.success(`已删除 ${Number(r?.data?.deleted || 0)} 条记录`);
    invalidateCache();
    clearTotalCache();
    await load({ forceRefresh: true });
    await refreshInventoryBatchAndSummary();
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.message || '删除失败');
  } finally {
    loading.value = false;
  }
}

async function exportCsv() {
  try {
    const params = buildParams(currentFilters(), false);
    await apiDownload(`/api/monitor-inventory-log/export?${params.toString()}`);
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败');
  }
}

async function openStartBatch() {
  if (!isAdmin.value) return;
  try {
    batchBusy.value = true;
    const [assetTotal, logResult] = await Promise.all([
      countMonitorAssets({ status: '', locationId: '', keyword: '', archiveReason: '', archiveMode: 'all', showArchived: true, inventoryStatus: '' }),
      apiGet('/api/monitor-inventory-log-count') as Promise<any>,
    ]);
    startBatchPreview.value = createInventoryBatchStartPreview(assetTotal, Number(logResult?.total || 0), inventorySummary.value, inventoryBatch.value.active?.name || '');
    startBatchSuggestedName.value = suggestInventoryBatchName('monitor', inventoryBatch.value);
    startBatchVisible.value = true;
  } catch (error: any) {
    ElMessage.error(error?.message || '加载开启盘点预览失败');
  } finally {
    batchBusy.value = false;
  }
}

async function confirmStartBatch(name: string) {
  try {
    batchBusy.value = true;
    const result: any = await executeInventoryBatchStart('monitor', String(name || startBatchSuggestedName.value), { clearPreviousLogs: true });
    const cleared = Number(result?.cleanup?.deleted || 0);
    if (result?.data) {
      applyInventoryBatchPayload({ active: result.data, latest: result.data, recent: inventoryBatch.value.recent || [] });
    }
    startBatchVisible.value = false;
    const successMessage = cleared > 0
      ? `已自动清空 ${cleared} 条显示器盘点记录，${result?.message || '已开启新一轮盘点'}`
      : (result?.message || '已开启新一轮盘点');
    ElMessage.success(successMessage);
    invalidateCache();
    clearTotalCache();
    await load({ forceRefresh: true });
    await refreshInventoryBatchAndSummary();
  } catch (error: any) {
    ElMessage.error(error?.message || '开启盘点批次失败');
  } finally {
    batchBusy.value = false;
  }
}

function openExecutionMode() {
  if (!inventoryBatch.value.active?.id) return ElMessage.warning('当前还没有进行中的显示器盘点批次，请先开启一轮盘点。');
  if (typeof window === 'undefined') return;
  window.open(new URL('/public/monitor-asset', window.location.origin).toString(), '_blank', 'noopener');
}

function scrollToBatchHistory() {
  nextTick(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function resolveLogsSectionElement() {
  const candidate = logsSectionRef.value?.$el || logsSectionRef.value;
  return candidate instanceof HTMLElement ? candidate : null;
}

function scrollToLogs() {
  nextTick(() => resolveLogsSectionElement()?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

async function loadMonitorBatchClosingSummary() {
  const base = buildMonitorBatchExportBaseFilters();
  const [totalCount, checkedOk, checkedIssue, unchecked] = await Promise.all([
    countMonitorAssets(base),
    countMonitorAssets({ ...base, inventoryStatus: 'CHECKED_OK' }),
    countMonitorAssets({ ...base, inventoryStatus: 'CHECKED_ISSUE' }),
    countMonitorAssets({ ...base, inventoryStatus: 'UNCHECKED' }),
  ]);
  return { total: totalCount, checked_ok: checkedOk, checked_issue: checkedIssue, unchecked };
}

async function closeActiveBatch() {
  const active = inventoryBatch.value.active;
  if (!active?.id) return ElMessage.warning('当前没有进行中的显示器盘点批次');
  try {
    batchBusy.value = true;
    const [summary, issueBreakdown] = await Promise.all([loadMonitorBatchClosingSummary(), loadMonitorIssueBreakdown()]);
    batchClosingSummary.value = summary;
    batchClosingIssueBreakdown.value = issueBreakdown;
    closeBatchVisible.value = true;
  } catch (error: any) {
    ElMessage.error(error?.message || '加载结案预览失败');
  } finally {
    batchBusy.value = false;
  }
}

async function confirmCloseActiveBatch() {
  const active = inventoryBatch.value.active;
  if (!active?.id) return ElMessage.warning('当前没有进行中的显示器盘点批次');
  try {
    batchBusy.value = true;
    const result: any = await executeInventoryBatchClose('monitor', active.id);
    if (result?.data) {
      applyInventoryBatchPayload({ active: null, latest: result.data, recent: inventoryBatch.value.active?.id ? [inventoryBatch.value.active, ...(inventoryBatch.value.recent || [])] : (inventoryBatch.value.recent || []) });
    }
    closeBatchVisible.value = false;
    ElMessage.success(result?.message || '本轮盘点已结束，结果快照正在后台生成');
    await refreshInventoryBatchAndSummary();
  } catch (error: any) {
    ElMessage.error(error?.message || '结束盘点批次失败');
  } finally {
    batchBusy.value = false;
  }
}


function applyIssueCardFilter(code: string) {
  const normalized = String(code || '').toUpperCase();
  if (action.value === 'ISSUE' && issueType.value === normalized) {
    action.value = '';
    issueType.value = '';
  } else {
    action.value = 'ISSUE';
    issueType.value = normalized;
  }
  onSearch();
}

function viewLedger(row: any) {
  void openMonitorLedgerFromInventoryLog(router, row, 'view');
}

function handleIssue(row: any) {
  if (String(row?.action || '').toUpperCase() !== 'ISSUE') return;
  void openMonitorLedgerFromInventoryLog(router, row, 'handle');
}
watch(() => route.query, () => {
  applyRouteFilters();
  void load();
  schedulePanelRefresh();
}, { deep: true });

onBeforeMount(() => {
  applyRouteFilters();
  void load({ keepPage: true });
  schedulePanelRefresh(120);
});

onMounted(() => {
  if (typeof window !== 'undefined') {
    snapshotPollTimer = window.setInterval(() => {
      if (!hasPendingSnapshotJob.value) return;
      void refreshInventoryBatchAndSummary();
    }, 5000);
  }
});

onActivated(() => {
  if (Date.now() - lastRefreshAt >= SOFT_REFRESH_TTL_MS) {
    void load({ keepPage: true, silent: true });
  }
  schedulePanelRefresh();
});

onUnmounted(() => {
  cancelPanelRefresh?.();
  cancelPanelRefresh = null;
  if (snapshotPollTimer != null && typeof window !== 'undefined') {
    window.clearInterval(snapshotPollTimer);
    snapshotPollTimer = null;
  }
});
</script>

