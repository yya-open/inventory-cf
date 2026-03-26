<template>
  <div>
    <el-card shadow="never" class="ui-page-card" style="margin-bottom: 12px">
      <div class="ui-toolbar">
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

    <el-card shadow="never" class="inventory-batch-page-card" style="margin-bottom: 12px">
      <div class="inventory-batch-page-grid">
        <div ref="batchSectionRef" class="inventory-batch-page-main">
          <AssetInventoryBatchInlinePanel kind-label="显示器" :inventory-batch="inventoryBatch" :current-summary="inventorySummary" :current-issue-breakdown="inventoryIssueBreakdown" />
        </div>
        <div class="inventory-batch-page-side">
          <AssetInventoryBatchActionMenu
            :busy="batchBusy"
            :is-admin="isAdmin"
            :active="Boolean(inventoryBatch.active?.id)"
            @start-batch="openStartBatch"
            @close-batch="closeActiveBatch"
            @open-execution="openExecutionMode"
            @open-history="scrollToBatchHistory"
            @jump-logs="scrollToLogs"
          />
        </div>
      </div>
    </el-card>

    <el-card ref="logsSectionRef" shadow="never">
      <LazyMountBlock title="正在装载显示器盘点记录…" min-height="360px">
        <el-table v-loading="loading" :data="rows" border style="width: 100%" @selection-change="onSelectionChange">
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
          <el-table-column v-if="isAdmin" label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button type="danger" link @click="deleteOne(row)">删除</el-button>
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
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from '../utils/el-services';
import { apiDownload, apiGet, apiPost } from '../api/client';
import { can } from '../store/auth';
import LazyMountBlock from '../components/LazyMountBlock.vue';
import AssetInventoryBatchInlinePanel from '../components/assets/AssetInventoryBatchInlinePanel.vue';
import AssetInventoryBatchActionMenu from '../components/assets/AssetInventoryBatchActionMenu.vue';
import AssetInventoryBatchCloseDialog from '../components/assets/AssetInventoryBatchCloseDialog.vue';
import AssetInventoryBatchStartDialog from '../components/assets/AssetInventoryBatchStartDialog.vue';
import { closeInventoryBatch, fetchInventoryBatch, startInventoryBatch, type InventoryBatchPayload } from '../api/inventoryBatches';
import { exportInventoryLogsBeforeBatch } from '../utils/inventoryBatchExport';
import { countMonitorAssets, fetchAllPages, getMonitorAssetInventorySummary, listMonitorAssets } from '../api/assetLedgers';
import type { AssetInventorySummary, InventoryIssueBreakdown, MonitorAsset, MonitorFilters } from '../types/assets';
import { assetStatusText, emptyInventoryIssueBreakdown, inventoryIssueTypeText, inventoryStatusText } from '../types/assets';
import { formatBeijingDateTime } from '../utils/datetime';
import { buildSuggestedInventoryBatchName } from '../utils/inventoryBatchNaming';

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

const route = useRoute();
const action = ref<string>('');
const issueType = ref<string>('');
const keyword = ref<string>('');
const dateRange = ref<[string, string] | null>(null);
const loading = ref(false);
const rows = ref<any[]>([]);
const page = ref(1);
const pageSize = ref(50);
const total = ref(0);
const selectedRows = ref<any[]>([]);
const isAdmin = computed(() => can('admin'));
const inventoryBatch = ref<InventoryBatchPayload>({ active: null, latest: null, recent: [] });
const inventorySummary = ref<AssetInventorySummary>({ total: 0, checked_ok: 0, checked_issue: 0, unchecked: 0 });
const batchBusy = ref(false);
const closeBatchVisible = ref(false);
const startBatchVisible = ref(false);
const startBatchSuggestedName = ref('');
const startBatchPreview = ref({ assetTotal: 0, checkedOk: 0, checkedIssue: 0, unchecked: 0, logTotal: 0, activeName: '' });
const batchClosingSummary = ref<AssetInventorySummary>({ total: 0, checked_ok: 0, checked_issue: 0, unchecked: 0 });
const inventoryIssueBreakdown = ref<InventoryIssueBreakdown>(emptyInventoryIssueBreakdown());
const batchClosingIssueBreakdown = ref<InventoryIssueBreakdown>(emptyInventoryIssueBreakdown());
const batchSectionRef = ref<HTMLElement | null>(null);
const logsSectionRef = ref<any>(null);

const totalCache = new Map<string, number>();
let totalTimer: any = null;
let excelUtilsPromise: Promise<typeof import('../utils/excel')> | null = null;

function filterKey() {
  return [action.value || '', issueType.value || '', keyword.value || '', dateRange.value?.[0] || '', dateRange.value?.[1] || ''].join('|');
}

function buildParams(withPage: boolean) {
  const params = new URLSearchParams();
  if (action.value) params.set('action', action.value);
  if (issueType.value) params.set('issue_type', issueType.value);
  if (keyword.value) params.set('keyword', keyword.value.trim());
  if (dateRange.value?.[0]) params.set('date_from', dateRange.value[0]);
  if (dateRange.value?.[1]) params.set('date_to', dateRange.value[1]);
  if (withPage) {
    params.set('page', String(page.value));
    params.set('page_size', String(pageSize.value));
  }
  return params;
}

function applyRouteFilters() {
  action.value = String(route.query.action || '').trim().toUpperCase();
  issueType.value = String(route.query.issue_type || '').trim().toUpperCase();
  keyword.value = String(route.query.keyword || '').trim();
  const from = String(route.query.date_from || '').trim();
  const to = String(route.query.date_to || '').trim();
  dateRange.value = from || to ? [from, to] as [string, string] : null;
  page.value = 1;
}

function onSearch() {
  page.value = 1;
  load();
}

function reset() {
  action.value = '';
  issueType.value = '';
  keyword.value = '';
  dateRange.value = null;
  page.value = 1;
  load();
}

async function load() {
  loading.value = true;
  try {
    const params = buildParams(true);
    params.set('fast', '1');
    const r: any = await apiGet(`/api/monitor-inventory-log/list?${params.toString()}`);
    rows.value = r.data || [];

    const key = filterKey();
    if (totalCache.has(key)) {
      total.value = Number(totalCache.get(key) || 0);
      return;
    }

    if (r.total === null || typeof r.total === 'undefined') {
      if (totalTimer) clearTimeout(totalTimer);
      totalTimer = setTimeout(() => {
        const p2 = buildParams(false);
        apiGet(`/api/monitor-inventory-log-count?${p2.toString()}`)
          .then((j: any) => {
            const v = Number(j.total || 0);
            totalCache.set(filterKey(), v);
            total.value = v;
          })
          .catch(() => {});
      }, 250);
    } else {
      const v = Number(r.total || 0);
      totalCache.set(key, v);
      total.value = v;
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadMonitorIssueBreakdown() {
  const codes = ['NOT_FOUND', 'WRONG_LOCATION', 'WRONG_QR', 'WRONG_STATUS', 'MISSING', 'OTHER'] as const;
  const result = await Promise.all(
    codes.map((code) => apiGet(`/api/monitor-inventory-log-count?action=ISSUE&issue_type=${encodeURIComponent(code)}`).then((res: any) => [code, Number(res?.total || 0)] as const))
  );
  const next = emptyInventoryIssueBreakdown();
  for (const [code, value] of result) next[code] = value;
  return next;
}

async function refreshInventoryBatchAndSummary() {
  try {
    const [batch, summary, issueBreakdown] = await Promise.all([
      fetchInventoryBatch('monitor'),
      getMonitorAssetInventorySummary(buildMonitorBatchExportBaseFilters()),
      loadMonitorIssueBreakdown(),
    ]);
    inventoryBatch.value = batch;
    inventorySummary.value = summary;
    inventoryIssueBreakdown.value = issueBreakdown;
  } catch (error) {
    console.warn('monitor inventory batch refresh failed', error);
  }
}

function onPageChange() { load(); }
function onPageSizeChange() { page.value = 1; load(); }
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
    const r: any = await apiPost('/api/monitor-inventory-log/delete', { ids, confirm: '删除' });
    ElMessage.success(`已删除 ${Number(r?.data?.deleted || 0)} 条记录`);
    selectedRows.value = [];
    totalCache.clear();
    await Promise.all([load(), refreshInventoryBatchAndSummary()]);
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
    totalCache.clear();
    await Promise.all([load(), refreshInventoryBatchAndSummary()]);
  } catch (e: any) {
    if (e === 'cancel' || e === 'close') return;
    ElMessage.error(e?.message || '删除失败');
  } finally {
    loading.value = false;
  }
}

async function exportCsv() {
  try {
    const params = buildParams(false);
    await apiDownload(`/api/monitor-inventory-log/export?${params.toString()}`);
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败');
  }
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

async function fetchAll(filters: MonitorFilters, pageSize = 300) {
  return fetchAllPages<MonitorAsset>((pageNumber, size) => listMonitorAssets(filters, pageNumber, size, true), pageSize);
}

function mapMonitorBatchWorkbookRows(items: MonitorAsset[]) {
  return items.map((row, index) => ({
    seq: index + 1,
    asset_code: row.asset_code || '-',
    brand_model: [row.brand, row.model].filter(Boolean).join(' · ') || '-',
    sn: row.sn || '-',
    status: assetStatusText(row.status),
    location: [row.parent_location_name, row.location_name].filter(Boolean).join('/') || '-',
    inventory_status: inventoryStatusText(row.inventory_status),
    inventory_at: row.inventory_at || '-',
    inventory_issue_type: String(row.inventory_status || '').toUpperCase() === 'CHECKED_ISSUE' ? inventoryIssueTypeText(row.inventory_issue_type) : '-',
    employee_name: row.employee_name || '-',
    employee_no: row.employee_no || '-',
    department: row.department || '-',
    remark: row.remark || '-',
  }));
}

function buildBatchExportTimestamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${hh}${mm}`;
}

function loadExcelUtils() {
  excelUtilsPromise ||= import('../utils/excel');
  return excelUtilsPromise;
}

async function exportMonitorBatchClosingWorkbook(active: NonNullable<InventoryBatchPayload['active']>) {
  const base = buildMonitorBatchExportBaseFilters();
  const [checkedRows, uncheckedRows, issueRows] = await Promise.all([
    fetchAll({ ...base, inventoryStatus: 'CHECKED_OK' }, 300),
    fetchAll({ ...base, inventoryStatus: 'UNCHECKED' }, 300),
    fetchAll({ ...base, inventoryStatus: 'CHECKED_ISSUE' }, 300),
  ]);
  const { exportWorkbookXlsx } = await loadExcelUtils();
  const filename = `${String(active.name || '显示器盘点').replace(/[\\/:*?"<>|]/g, '_')}_${buildBatchExportTimestamp()}_盘点结果.xlsx`;
  const summaryRows = [
    { 项目: '盘点批次', 内容: active.name || '-' },
    { 项目: '开始时间', 内容: active.started_at || '-' },
    { 项目: '导出时间', 内容: formatBeijingDateTime(new Date().toISOString()) },
    { 项目: '已盘', 内容: checkedRows.length },
    { 项目: '未盘', 内容: uncheckedRows.length },
    { 项目: '异常', 内容: issueRows.length },
    { 项目: '设备总数', 内容: checkedRows.length + uncheckedRows.length + issueRows.length },
  ];
  const sheetHeaders = [
    { key: 'seq', title: '序号' },
    { key: 'asset_code', title: '资产编号' },
    { key: 'brand_model', title: '显示器' },
    { key: 'sn', title: 'SN' },
    { key: 'status', title: '业务状态' },
    { key: 'location', title: '位置' },
    { key: 'inventory_status', title: '盘点状态' },
    { key: 'inventory_at', title: '盘点时间' },
    { key: 'inventory_issue_type', title: '异常类型' },
    { key: 'employee_name', title: '领用人' },
    { key: 'employee_no', title: '工号' },
    { key: 'department', title: '部门' },
    { key: 'remark', title: '备注' },
  ];
  await exportWorkbookXlsx({
    filename,
    sheets: [
      { sheetName: '汇总', rows: summaryRows },
      { sheetName: '已盘', headers: sheetHeaders, rows: mapMonitorBatchWorkbookRows(checkedRows) },
      { sheetName: '未盘', headers: sheetHeaders, rows: mapMonitorBatchWorkbookRows(uncheckedRows) },
      { sheetName: '异常', headers: sheetHeaders, rows: mapMonitorBatchWorkbookRows(issueRows) },
    ],
  });
  return { filename, checked: checkedRows.length, unchecked: uncheckedRows.length, issue: issueRows.length };
}

async function openStartBatch() {
  if (!isAdmin.value) return;
  try {
    batchBusy.value = true;
    const [assetTotal, logResult] = await Promise.all([
      countMonitorAssets({ status: '', locationId: '', keyword: '', archiveReason: '', archiveMode: 'all', showArchived: true, inventoryStatus: '' }),
      apiGet('/api/monitor-inventory-log-count') as Promise<any>,
    ]);
    startBatchPreview.value = {
      assetTotal: Number(assetTotal || 0),
      checkedOk: Number(inventorySummary.value.checked_ok || 0),
      checkedIssue: Number(inventorySummary.value.checked_issue || 0),
      unchecked: Number(inventorySummary.value.unchecked || 0),
      logTotal: Number(logResult?.total || 0),
      activeName: inventoryBatch.value.active?.name || '',
    };
    startBatchSuggestedName.value = buildSuggestedInventoryBatchName('monitor', [inventoryBatch.value.active?.name, inventoryBatch.value.latest?.name, ...(inventoryBatch.value.recent || []).map((item) => item?.name)]);
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
    await exportInventoryLogsBeforeBatch('monitor');
    const result: any = await startInventoryBatch('monitor', String(name || startBatchSuggestedName.value), { clearPreviousLogs: true });
    const cleared = Number(result?.cleanup?.deleted || 0);
    startBatchVisible.value = false;
    const successMessage = cleared > 0
      ? `已自动导出并清空 ${cleared} 条显示器盘点记录，${result?.message || '已开启新一轮盘点'}`
      : (result?.message || '已开启新一轮盘点');
    ElMessage.success(successMessage);
    totalCache.clear();
    await Promise.all([load(), refreshInventoryBatchAndSummary()]);
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
  nextTick(() => batchSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
    const exported = await exportMonitorBatchClosingWorkbook(active);
    const result: any = await closeInventoryBatch('monitor', active.id);
    closeBatchVisible.value = false;
    ElMessage.success(`${result?.message || '本轮盘点已结束'}，结果表已导出（已盘 ${exported.checked} / 未盘 ${exported.unchecked} / 异常 ${exported.issue}）`);
    await refreshInventoryBatchAndSummary();
  } catch (error: any) {
    ElMessage.error(error?.message || '结束盘点批次失败');
  } finally {
    batchBusy.value = false;
  }
}

watch(() => route.query, () => {
  applyRouteFilters();
  load();
}, { deep: true });

onMounted(() => {
  applyRouteFilters();
  void Promise.all([load(), refreshInventoryBatchAndSummary()]);
});
</script>

<style scoped>
.inventory-batch-page-card { overflow: hidden; }
.inventory-batch-page-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  gap: 16px;
  align-items: start;
}
.inventory-batch-page-main,
.inventory-batch-page-side { min-width: 0; }
@media (max-width: 960px) {
  .inventory-batch-page-grid { grid-template-columns: 1fr; }
}
</style>
