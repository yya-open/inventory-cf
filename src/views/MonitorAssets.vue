<template>
  <div class="ledger-page ledger-page--monitor">
    <section class="ledger-section ledger-section--toolbar">
      <MonitorAssetsToolbar
      :mobile-mode="isMobile"
      v-model:status="status"
      v-model:location-id="locationId"
      v-model:inventory-status="inventoryStatus"
      v-model:keyword="keyword"
      v-model:archive-reason="archiveReason"
      v-model:archive-mode="archiveMode"
      v-model:show-archived="showArchived"
      :location-options="locationOptions"
      :can-operator="canOperator"
      :is-admin="isAdmin"
      :visible-columns="displayedMonitorVisibleColumns"
      :column-order="columnOrder"
      :column-options="displayedMonitorColumnOptions"
      :selected-count="selectedCount"
      :export-busy="exportBusy"
      :import-busy="importBusy"
      :init-qr-busy="initQrBusy"
      :batch-busy="batchBusy"
      :archive-reason-options="archiveReasonOptions"
      :summary="inventorySummary"
      :has-active-batch="hasActiveInventoryBatch"
      :density="density"
      :saved-views="savedViews"
      :active-view-name="activeViewName"
      @update:visible-columns="updateVisibleColumns"
      @update:density="setDensity"
      @move-column="moveVisibleColumn"
      @search="reloadList"
      @reset="resetFilters"
      @set-inventory-filter="setInventoryFilter"
      @export="exportExcel"
      @export-archive="exportArchiveRecords"
      @export-selected="exportSelectedRows"
      @clear-selection="clearSelection"
      @export-selected-qr="exportSelectedQrLinks"
      @export-selected-qr-cards="exportSelectedQrCards"
      @export-selected-qr-png="exportSelectedQrPng"
      @batch-delete="batchDeleteSelected"
      @batch-status="openBatchStatusDialog"
      @batch-location="openBatchLocationDialog"
      @batch-owner="openBatchOwnerDialog"
      @batch-archive="batchArchiveSelected"
      @batch-restore="batchRestoreSelected"
      @save-view="handleSaveView"
      @apply-view="handleApplyView"
      @delete-view="handleDeleteView"
      @restore-columns="restoreDefaultColumns"
      @download-template="downloadMonitorTemplate"
      @import-file="onImportMonitorFile"
      @open-create="openCreate"
      @toolbar-more="handleToolbarMore"
      @ensure-location-options="ensureLocationOptionsReady"
      />
    </section>

    <section class="ledger-section ledger-section--table">
      <MonitorAssetsTable
      :mobile-mode="isMobile"
      :rows="rows"
      :loading="refreshing"
      :initial-loading="initialLoading && !rows.length"
      :total="total"
      :page="page"
      :page-size="pageSize"
      :can-operator="canOperator"
      :is-admin="isAdmin"
      :can-export="canQrExport"
      :can-reset="canQrReset"
      :status-text="assetStatusText"
      :location-text="locationText"
      :visible-columns="visibleColumns"
      :column-widths="columnWidths"
      :selected-ids="selectedIds"
      :density="density"
      :show-inventory-column="hasActiveInventoryBatch"
      :enable-inventory-highlight="hasActiveInventoryBatch"
      :has-filters="hasActiveFilters"
      @open-info="openInfo"
      @in="openIn"
      @out="openOut"
      @row-more="handleRowMore"
      @remove="removeAsset"
      @restore="restoreAsset"
      @open-recommended="openRecommendedAction"
      @selection-change="onSelectionChange"
      @column-resize="updateColumnWidth"
      @page-change="(value) => onPageChange(currentFiltersForList(), value)"
      @size-change="(value) => onPageSizeChange(currentFiltersForList(), value)"
      @reset-filters="resetFilters"
      />
    </section>


    <MonitorAssetFormDialog
      v-if="lazyAssetDialog"
      v-model:visible="dlgAsset.show"
      :mode="dlgAsset.mode"
      :form="dlgAsset.form"
      :location-options="locationOptions"
      :saving="assetSaving"
      :brand-options="monitorBrandOptions"
      @save="saveAsset"
      @cancel="closeAssetDialog"
    />

    <MonitorAssetInfoDialog
      v-if="lazyInfoDialog"
      v-model:visible="infoVisible"
      :row="infoRow"
      :location-text="locationText"
      :status-text="assetStatusText"
      @view-audit="openAuditHistory()"
    />

    <MonitorAssetOperationDialog
      v-if="lazyOperationDialog"
      v-model:visible="dlgOp.show"
      :title="dlgOp.title"
      :kind="dlgOp.kind"
      :asset="dlgOp.asset"
      :form="dlgOp.form"
      :location-options="locationOptions"
      :submitting="opSubmitting"
      @submit="submitOp"
    />

    <MonitorAssetQrDialog
      v-if="lazyQrDialog"
      v-model:visible="qrVisible"
      :loading="qrLoading"
      :row="qrRow"
      :link="qrLink"
      :data-url="qrDataUrl"
      :is-admin="isAdmin"
      :can-export="canQrExport"
      :can-reset="canQrReset"
      :status-text="assetStatusText"
      @download-qr="downloadQr"
      @download-label="downloadLabel"
      @open-link="openQrInNewTab"
      @copy-link="copyQrLink"
      @reset="resetQr"
    />

    <MonitorLocationManagerDialog
      v-if="lazyLocationDialog"
      v-model:visible="dlgLoc.show"
      v-model:new-name="dlgLoc.newName"
      v-model:parent-id="dlgLoc.parentId"
      :rows="dlgLoc.rows"
      :location-parent-options="locationParentOptions"
      :is-admin="isAdmin"
      :build-loc-label="buildLocLabel"
      :saving="locationSaving"
      @create="createLocation"
      @update-location="updateLocation"
      @delete-location="deleteLocation"
    />

    <MonitorAssetBatchStatusDialog
      v-if="lazyBatchStatusDialog"
      v-model:visible="batchStatusVisible"
      v-model:value="batchStatusValue"
      :loading="batchBusy"
      :preview="batchStatusPreview"
      @submit="submitBatchStatus"
    />

    <MonitorAssetBatchLocationDialog
      v-if="lazyBatchLocationDialog"
      v-model:visible="batchLocationVisible"
      v-model:value="batchLocationValue"
      :loading="batchBusy"
      :location-options="locationOptions"
      :preview="batchLocationPreview"
      @submit="submitBatchLocation"
    />

    <MonitorAssetBatchOwnerDialog
      v-if="lazyBatchOwnerDialog"
      v-model:visible="batchOwnerVisible"
      :loading="batchBusy"
      :form="batchOwnerForm"
      :preview="batchOwnerPreview"
      @submit="submitBatchOwner"
    />

    <MonitorAssetBatchArchiveDialog
      v-if="lazyBatchArchiveDialog"
      v-model:visible="batchArchiveVisible"
      :loading="batchBusy"
      :form="batchArchiveForm"
      :preview="batchArchivePreview"
      :archive-reason-options="archiveReasonOptions"
      :summary="inventorySummary"
      @submit="submitBatchArchive"
    />

    <QrPrintTemplateDialog
      v-model:visible="qrTemplateVisible"
      :kind="qrTemplateKind"
      scope="monitor"
      kind-label="显示器"
      @submit="submitQrPrintTemplate"
    />
    <QrExportProgressDialog
      :visible="qrExportProgress.visible"
      :title="qrExportProgress.title"
      :stage="qrExportProgress.stage"
      :completed="qrExportProgress.current"
      :total="qrExportProgress.total"
      :detail="qrExportProgress.detail"
    />

  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeMount, onBeforeUnmount, onMounted, onActivated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, ElNotification } from "../utils/el-services";
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import { withDestructiveActionFeedback } from '../utils/destructiveAction';
import { countMonitorAssets, getMonitorAssetInventorySummary, listMonitorAssets } from '../api/assetLedgers';
import { useInventoryBatchStore } from '../composables/useInventoryBatchStore';
import type { InventoryBatchPayload } from '../api/inventoryBatches';
import { fetchBulkMonitorAssetQrLinks } from '../api/assetQr';
import { exportAssetQrLinksWorkbook, exportAssetQrPrintLocal } from '../utils/assetQrExport';
import { getCachedAssetQr, invalidateAssetQr, setCachedAssetQr } from '../utils/assetQrCache';
import { useAssetLedgerPage } from '../composables/useAssetLedgerPage';
import { useCrossPageSelection } from '../composables/useCrossPageSelection';
import { can, canPerm } from '../store/auth';
import type { AssetInventorySummary, LocationRow, MonitorAsset, MonitorFilters } from '../types/assets';
import { assetStatusText, inventoryIssueTypeText, inventoryStatusText } from '../types/assets';
import { formatBeijingDateTime } from '../utils/datetime';
import { fetchSystemSettings, getCachedSystemSettings, markMonitorBrandSettingsApplied, shouldRefreshMonitorBrandSettings } from '../api/systemSettings';
import MonitorAssetsToolbar from '../components/assets/MonitorAssetsToolbar.vue';
import MonitorAssetsTable from '../components/assets/MonitorAssetsTable.vue';
import QrPrintTemplateDialog from '../components/assets/QrPrintTemplateDialog.vue';
import QrExportProgressDialog from '../components/assets/QrExportProgressDialog.vue';
import type { QrPrintTemplate, QrPrintTemplateKind } from '../utils/qrPrintTemplate';
import type { AssetQrExportProgress } from '../utils/assetQrExport';
import { useLocationCatalog } from '../composables/useLocationCatalog';
import { useMonitorAssetViewState } from './assets/monitorAssetViewState';
import { createAssetPagePatchController, applyGenericArchivePatch, applyGenericDeletePatch, applyGenericRestorePatch } from './assets/assetLocalPatch';
import { buildBulkDeleteConfirmTip, extractAffectedIds, summarizeBulkDeleteResult } from './assets/assetBulkActions';

const MonitorAssetFormDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetFormDialog.vue'));
const MonitorAssetInfoDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetInfoDialog.vue'));
const MonitorAssetOperationDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetOperationDialog.vue'));
const MonitorAssetQrDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetQrDialog.vue'));
const MonitorLocationManagerDialog = defineAsyncComponent(() => import('../components/assets/MonitorLocationManagerDialog.vue'));
const MonitorAssetBatchStatusDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetBatchStatusDialog.vue'));
const MonitorAssetBatchLocationDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetBatchLocationDialog.vue'));
const MonitorAssetBatchOwnerDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetBatchOwnerDialog.vue'));
const MonitorAssetBatchArchiveDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetBatchArchiveDialog.vue'));

const { enabledLocations: locations, ensureEnabledLocations, ensureAllLocations, invalidateLocationCatalog } = useLocationCatalog();
const canOperator = computed(() => can('operator'));
const isAdmin = computed(() => can('admin'));
const canQrExport = computed(() => canPerm('qr_export'));
const canQrReset = computed(() => canPerm('qr_reset'));
const router = useRouter();
const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth <= 900 : false);
const systemSettings = ref(getCachedSystemSettings());
const archiveReasonOptions = computed(() => systemSettings.value.asset_archive_reason_options || []);
const monitorBrandOptions = computed(() => systemSettings.value.dictionary_monitor_brand_options || []);
const qrTemplateVisible = ref(false);
const qrExportProgress = ref<{ visible: boolean; title: string; stage: string; current: number; total: number; detail: string }>({ visible: false, title: '', stage: '', current: 0, total: 1, detail: '' });
let qrExportProgressAutoCloseTimer: number | null = null;
const qrTemplateKind = ref<QrPrintTemplateKind>('cards');
const qrTemplateAction = ref<'batch-cards' | 'batch-sheet' | 'single-cards' | 'single-sheet'>('batch-cards');
const inventorySummary = ref<AssetInventorySummary>({ unchecked: 0, checked_ok: 0, checked_issue: 0, total: 0 });
const { payload: inventoryBatch, refresh: refreshInventoryBatchStore, lastLoadedAt: inventoryBatchLoadedAt } = useInventoryBatchStore('monitor');
const hasActiveInventoryBatch = computed(() => Boolean(inventoryBatch.value.active?.id));
const displayedMonitorColumnOptions = computed(() => hasActiveInventoryBatch.value ? monitorColumnOptions : monitorColumnOptions.filter((item) => item.value !== 'inventory'));
const displayedMonitorVisibleColumns = computed(() => hasActiveInventoryBatch.value ? visibleColumns.value : visibleColumns.value.filter((item) => item !== 'inventory'));
const hasActiveFilters = computed(() => {
  const filters = currentFiltersForList();
  return Boolean(filters.status || filters.locationId || filters.keyword || filters.inventoryStatus || filters.archiveMode !== 'active' || filters.archiveReason);
});

const {
  status,
  locationId,
  inventoryStatus,
  keyword,
  archiveReason,
  archiveMode,
  showArchived,
  columnOrder,
  visibleColumns,
  columnWidths,
  density,
  savedViews,
  activeViewName,
  initialPageSize,
  monitorColumnOptions,
  currentFilters,
  clearKeywordTimer,
  bindPersistence,
  cleanup: cleanupViewState,
  updateVisibleColumns,
  restoreDefaultColumns,
  moveVisibleColumn,
  updateColumnWidth,
  setDensity,
  saveCurrentView,
  applySavedView,
  deleteSavedView,
  runWithoutAutoSearch,
} = useMonitorAssetViewState(() => {
  void refreshLedgerData();
});


onMounted(() => {
  void initMonitorBrandOptions();
});


function clearQrExportProgressAutoCloseTimer() {
  if (qrExportProgressAutoCloseTimer != null) {
    window.clearTimeout(qrExportProgressAutoCloseTimer);
    qrExportProgressAutoCloseTimer = null;
  }
}

function startQrExportProgress(title: string) {
  clearQrExportProgressAutoCloseTimer();
  qrExportProgress.value = { visible: true, title, stage: '准备中', current: 0, total: 1, detail: '正在准备导出…' };
}

function updateQrExportProgress(progress: AssetQrExportProgress) {
  clearQrExportProgressAutoCloseTimer();
  qrExportProgress.value = {
    ...qrExportProgress.value,
    visible: true,
    stage: progress.stage,
    current: progress.current,
    total: Math.max(1, progress.total),
    detail: progress.detail || '',
  };
  if (progress.stage === '下载文件' && progress.current >= Math.max(1, progress.total)) {
    qrExportProgressAutoCloseTimer = window.setTimeout(() => {
      qrExportProgress.value = { ...qrExportProgress.value, visible: false };
      qrExportProgressAutoCloseTimer = null;
    }, 600);
  }
}

function finishQrExportProgress() {
  clearQrExportProgressAutoCloseTimer();
  qrExportProgress.value = { ...qrExportProgress.value, visible: false };
}

function notifyAction(title: string, message: string, type: 'success' | 'warning' | 'info' | 'error' = 'success') {
  ElNotification({ title, message, type, duration: 2600, offset: 72 });
}

function handleSaveView(name: string) {
  const savedName = saveCurrentView(name);
  if (!savedName) return ElMessage.warning('请先输入视图名称');
  notifyAction('视图已保存', `已保存为“${savedName}”，下次进入页面会继续保留。`);
}

function handleApplyView(name: string) {
  if (!applySavedView(name)) return ElMessage.warning('视图不存在或已失效');
  notifyAction('视图已应用', `当前已切换到“${name}”。`, 'info');
  reloadList();
}

function handleDeleteView(name: string) {
  if (!deleteSavedView(name)) return ElMessage.warning('视图不存在或已删除');
  notifyAction('视图已删除', `已删除“${name}”视图。`, 'warning');
}

let qrCodeLibPromise: Promise<typeof import('qrcode')> | null = null;
let excelUtilsPromise: Promise<typeof import('../utils/excel')> | null = null;
let qrCardUtilsPromise: Promise<typeof import('../utils/qrCards')> | null = null;

function loadQrCodeLib() {
  qrCodeLibPromise ||= import('qrcode');
  return qrCodeLibPromise;
}

function loadExcelUtils() {
  excelUtilsPromise ||= import('../utils/excel');
  return excelUtilsPromise;
}

function buildBatchExportTimestamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${hh}${mm}`;
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

function mapMonitorBatchWorkbookRows(rows: MonitorAsset[]) {
  return rows.map((row, index) => ({
    seq: index + 1,
    asset_code: row.asset_code || '-',
    brand_model: [row.brand, row.model].filter(Boolean).join(' · ') || '-',
    sn: row.sn || '-',
    status: assetStatusText(row.status),
    location: locationText(row),
    inventory_status: inventoryStatusText(row.inventory_status),
    inventory_at: row.inventory_at || '-',
    inventory_issue_type: String(row.inventory_status || '').toUpperCase() === 'CHECKED_ISSUE' ? inventoryIssueTypeText(row.inventory_issue_type) : '-',
    employee_name: row.employee_name || '-',
    employee_no: row.employee_no || '-',
    department: row.department || '-',
    remark: row.remark || '-',
  }));
}

async function exportMonitorBatchClosingWorkbook(active: NonNullable<InventoryBatchPayload['active']>) {
  const base = buildMonitorBatchExportBaseFilters();
  const [checkedRows, uncheckedRows, issueRows] = await Promise.all([
    fetchAll({ ...base, inventoryStatus: 'CHECKED_OK' }, 300),
    fetchAll({ ...base, inventoryStatus: 'UNCHECKED' }, 300),
    fetchAll({ ...base, inventoryStatus: 'CHECKED_ISSUE' }, 300),
  ]);
  const { exportWorkbookXlsx } = await loadExcelUtils();
  const filename = `${String(active.name || '显示器盘点').replace(/[\/:*?"<>|]/g, '_')}_${buildBatchExportTimestamp()}_盘点结果.xlsx`;
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

function loadAssetLedgerExportActions() {
  return import('./assets/assetLedgerExportActions');
}

function loadQrCardUtils() {
  qrCardUtilsPromise ||= import('../utils/qrCards');
  return qrCardUtilsPromise;
}

async function buildInlineQrSvg(link: string, size = 360) {
  const QRCode = await loadQrCodeLib();
  const svgMarkup = await QRCode.toString(link, { type: 'svg', width: Number(size), margin: 2, errorCorrectionLevel: 'Q' });
  return {
    svgMarkup,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`
  };
}
const locationText = (row: MonitorAsset) => [row.parent_location_name, row.location_name].filter(Boolean).join('/') || '-';

const locationOptions = computed(() => {
  const locationMap = new Map<number, LocationRow>();
  locations.value.forEach((location) => locationMap.set(location.id, location));
  const labelOf = (location: LocationRow) => {
    const parent = location.parent_id ? locationMap.get(Number(location.parent_id)) : null;
    return [parent?.name, location.name].filter(Boolean).join('/');
  };
  return locations.value
    .filter((location) => location.enabled === 1)
    .map((location) => ({ value: location.id, label: labelOf(location) }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

const locationParentOptions = computed(() => {
  return locations.value
    .filter((location) => location.enabled === 1)
    .map((location) => ({ value: location.id, label: location.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

async function handleMaybeMissingSchema(error: any) {
  const message = String(error?.message || '');
  const missing =
    message.includes('no such table: monitor_assets') ||
    message.includes('no such table: pc_locations') ||
    message.includes('no such table: monitor_tx');
  if (!missing) throw error;
  if (!can('admin')) {
    ElMessage.error('显示器模块数据库表尚未初始化，请联系管理员执行初始化');
    throw error;
  }
  await ElMessageBox.confirm(
    '检测到显示器模块数据库表尚未创建（monitor_assets/monitor_tx/pc_locations）。\n\n是否现在初始化？（仅需执行一次）',
    '需要初始化',
    {
      type: 'warning',
      confirmButtonText: '初始化',
      cancelButtonText: '取消',
    }
  );
  await apiPost('/api/monitor-init', { confirm: '初始化' });
  ElMessage.success('初始化完成，请重试操作');
}

function currentFiltersForList(): MonitorFilters {
  const filters = currentFilters();
  if (!hasActiveInventoryBatch.value) return { ...filters, inventoryStatus: '' };
  return filters;
}

async function loadLocations(force = false) {
  try {
    await ensureEnabledLocations(force);
  } catch (error: any) {
    await handleMaybeMissingSchema(error);
  }
}

async function ensureLocationOptionsReady(force = false) {
  await loadLocations(force);
}

const { rows, loading, refreshing, initialLoading, initialized, page, pageSize, total, load, reload, onPageChange, onPageSizeChange, fetchAll, invalidateTotal, invalidateCache } = useAssetLedgerPage<MonitorFilters, MonitorAsset>({
  cacheNamespace: 'monitor-assets',
  cacheTtlMs: 30_000,
  createFilterKey: (filters) => `status=${filters.status}&location=${filters.locationId}&inventory=${filters.inventoryStatus || ''}&keyword=${filters.keyword}&archive=${filters.archiveReason || ''}&archived=${filters.showArchived ? 1 : 0}&archiveMode=${filters.archiveMode}`,
  fetchPage: async (filters, currentPage, currentPageSize, fast, signal) => {
    try {
      return await listMonitorAssets(filters, currentPage, currentPageSize, fast, signal);
    } catch (error: any) {
      await handleMaybeMissingSchema(error);
      return await listMonitorAssets(filters, currentPage, currentPageSize, fast, signal);
    }
  },
  fetchTotal: (filters, signal) => countMonitorAssets(filters, signal),
});

pageSize.value = initialPageSize;
const SOFT_REFRESH_TTL_MS = 30_000;
let lastRefreshAt = 0;

const {
  refreshCurrent,
  patchCurrentRows,
  removeCurrentRows,
  ensureLocalPatchedPageStable,
} = createAssetPagePatchController<MonitorAsset>({
  rows,
  total,
  page,
  load,
  currentFilters,
  invalidateTotal,
  invalidateListCache: () => invalidateCache(),
  touch: () => {
    lastRefreshAt = Date.now();
  },
});

function findLocationParts(locationId: number) {
  const current = locations.value.find((item) => Number(item.id) === Number(locationId));
  const parent = current && current.parent_id ? locations.value.find((item) => Number(item.id) === Number(current.parent_id)) : null;
  return { location_name: current?.name || '', parent_location_name: parent?.name || '' };
}

function applyMonitorStatusPatch(ids: number[], nextStatus: string) {
  patchCurrentRows(ids, (row) => ({ ...row, status: nextStatus }));
}

function applyMonitorLocationPatch(ids: number[], nextLocationId: number | '') {
  const normalizedId = Number(nextLocationId || 0) || null;
  const parts = normalizedId ? findLocationParts(normalizedId) : { location_name: '', parent_location_name: '' };
  patchCurrentRows(ids, (row) => ({ ...row, location_id: normalizedId, ...parts }));
}

function applyMonitorOwnerPatch(ids: number[], payload: { employee_name?: string; employee_no?: string; department?: string }) {
  patchCurrentRows(ids, (row) => ({
    ...row,
    employee_name: payload.employee_name || '',
    employee_no: payload.employee_no || '',
    department: payload.department || '',
  }));
}

function applyMonitorArchivePatch(ids: number[], payload: { reason?: string; note?: string }) {
  applyGenericArchivePatch<MonitorAsset>({
    ids,
    archiveMode: archiveMode.value,
    payload,
    patchCurrentRows,
    removeCurrentRows,
    now: formatBeijingDateTime(new Date().toISOString()),
  });
}

function applyMonitorRestorePatch(ids: number[]) {
  applyGenericRestorePatch<MonitorAsset>({
    ids,
    archiveMode: archiveMode.value,
    patchCurrentRows,
    removeCurrentRows,
  });
}

function applyMonitorDeletePatch(successItems: Array<{ id: number; action: string; reason?: string | null }>) {
  applyGenericDeletePatch<MonitorAsset>({
    successItems,
    archiveMode: archiveMode.value,
    archiveReasonFallback: '删除转归档',
    patchCurrentRows,
    removeCurrentRows,
  });
}

const exportBusy = ref(false);
const importBusy = ref(false);
const initQrBusy = ref(false);
const batchBusy = ref(false);
const batchStatusVisible = ref(false);
const batchStatusValue = ref('IN_STOCK');
const batchLocationVisible = ref(false);
const batchLocationValue = ref<number | ''>('');
const batchOwnerVisible = ref(false);
const batchOwnerForm = ref({ employee_name: '', employee_no: '', department: '' });
const batchArchiveVisible = ref(false);
const batchArchiveForm = ref({ reason: systemSettings.value.warehouse_default_archive_reason || '停用归档', note: '' });

const lazyAssetDialog = ref(false);
const lazyInfoDialog = ref(false);
const lazyOperationDialog = ref(false);
const lazyQrDialog = ref(false);
const lazyLocationDialog = ref(false);
const lazyBatchStatusDialog = ref(false);
const lazyBatchLocationDialog = ref(false);
const lazyBatchOwnerDialog = ref(false);
const lazyBatchArchiveDialog = ref(false);

function warmLazyDialog(dialog: { value: boolean }) {
  if (!dialog.value) dialog.value = true;
}

const batchStatusPreview = computed(() => {
  const total = selectedRows.value.length;
  const archived = selectedRows.value.filter((row) => Number(row.archived || 0) === 1).length;
  const sameStatus = selectedRows.value.filter((row) => Number(row.archived || 0) !== 1 && String(row.status || '') === String(batchStatusValue.value || '')).length;
  return { total, archived, sameStatus, eligible: Math.max(0, total - archived - sameStatus) };
});

const batchLocationPreview = computed(() => {
  const total = selectedRows.value.length;
  const archived = selectedRows.value.filter((row) => Number(row.archived || 0) === 1).length;
  const sameLocation = selectedRows.value.filter((row) => Number(row.archived || 0) !== 1 && Number(row.location_id || 0) === Number(batchLocationValue.value || 0)).length;
  return { total, archived, sameLocation, eligible: Math.max(0, total - archived - sameLocation) };
});

const batchOwnerPreview = computed(() => {
  const total = selectedRows.value.length;
  const archived = selectedRows.value.filter((row) => Number(row.archived || 0) === 1).length;
  const sameOwner = selectedRows.value.filter((row) => {
    if (Number(row.archived || 0) === 1) return false;
    const name = String(row.employee_name || '').trim();
    const no = String(row.employee_no || '').trim();
    const dept = String(row.department || '').trim();
    return name === String(batchOwnerForm.value.employee_name || '').trim()
      && no === String(batchOwnerForm.value.employee_no || '').trim()
      && dept === String(batchOwnerForm.value.department || '').trim();
  }).length;
  return { total, archived, sameOwner, eligible: Math.max(0, total - archived - sameOwner) };
});

const batchArchivePreview = computed(() => {
  const total = selectedRows.value.length;
  const archived = selectedRows.value.filter((row) => Number(row.archived || 0) === 1).length;
  return { total, archived, eligible: Math.max(0, total - archived) };
});

const { selectedIds, selectedRows, selectedCount, syncPageSelection, clearSelection } = useCrossPageSelection<MonitorAsset>((row) => String(row.id));
const assetSaving = ref(false);
const opSubmitting = ref(false);
const locationSaving = ref(false);

bindPersistence(pageSize);

function buildInventorySummaryFilters(filters: MonitorFilters = currentFiltersForList()): MonitorFilters {
  return { ...filters, inventoryStatus: '' };
}

const INVENTORY_BATCH_SOFT_TTL_MS = 5 * 60_000;

async function refreshInventoryBatch(options: { force?: boolean } = {}) {
  try {
    await refreshInventoryBatchStore({ silent: true, force: options.force, ttlMs: INVENTORY_BATCH_SOFT_TTL_MS });
    if (!inventoryBatch.value.active && inventoryStatus.value) {
      runWithoutAutoSearch(() => {
        inventoryStatus.value = '';
      });
    }
  } catch {
    inventoryBatch.value = { active: null, latest: inventoryBatch.value.latest || null, recent: inventoryBatch.value.recent || [] };
  }
}

function shouldLoadInventorySummary(filters: MonitorFilters = currentFiltersForList()) {
  return Boolean(hasActiveInventoryBatch.value || String(filters.inventoryStatus || '').trim());
}

async function refreshInventorySummary(filters: MonitorFilters = currentFiltersForList()) {
  if (!shouldLoadInventorySummary(filters)) {
    inventorySummary.value = { total: 0, normal: 0, profit: 0, loss: 0, pending: 0 } as any;
    return;
  }
  try {
    if (hasActiveInventoryBatch.value) invalidateAssetInventorySummaryCache('monitor');
    inventorySummary.value = await getMonitorAssetInventorySummary(buildInventorySummaryFilters(filters), undefined, { force: hasActiveInventoryBatch.value });
  } catch (error) {
    console.warn('monitor inventory summary failed', error);
  }
}

function runWhenBrowserIdle(task: () => void | Promise<void>, timeout = 1200) {
  if (typeof window === 'undefined') {
    void Promise.resolve().then(task);
    return;
  }
  const runner = () => {
    window.setTimeout(() => {
      void task();
    }, 80);
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => runner(), { timeout });
    return;
  }
  window.requestAnimationFrame(() => {
    runner();
  });
}

function scheduleAuxiliaryRefresh(initialFilters: MonitorFilters) {
  const snapshot = { ...initialFilters };
  const needSummary = shouldLoadInventorySummary(snapshot);
  runWhenBrowserIdle(async () => {
    if (needSummary) void refreshInventorySummary(snapshot);
  });
}

async function refreshLedgerData(options: { keepPage?: boolean; silent?: boolean } = {}) {
  clearKeywordTimer();
  const filters = currentFiltersForList();
  if (options.keepPage) {
    await load(filters, { keepPage: true, silent: options.silent });
  } else {
    await reload(filters, { silent: options.silent });
  }
  lastRefreshAt = Date.now();
  scheduleAuxiliaryRefresh(filters);
}

const reloadList = () => {
  void refreshLedgerData();
};

function handleToolbarMore(command: string) {
  if (command === 'location') return openLocationMgr();
  if (command === 'initQr') return initQrKeys();
}

function handleRowMore(command: string, row: MonitorAsset) {
  if (command === 'in') return openIn(row);
  if (command === 'out') return openOut(row);
  if (command === 'edit') return openEdit(row);
  if (command === 'qr') return openQr(row);
  if (command === 'audit') return openAuditHistory(row);
  if (command === 'return') return openReturn(row);
  if (command === 'transfer') return openTransfer(row);
  if (command === 'restore') return restoreAsset(row);
  if (command === 'delete') return removeAsset(row);
}


async function restoreAsset(row: MonitorAsset) {
  try {
    await ElMessageBox.confirm(`确认恢复显示器：${row.asset_code || '-'} ${row.brand || ''} ${row.model || ''}？恢复后将重新出现在默认台账列表中。`, '恢复归档', {
      type: 'warning',
      confirmButtonText: '确认恢复',
      cancelButtonText: '取消',
    });
    batchBusy.value = true;
    const result: any = await apiPost('/api/monitor-assets-bulk', { action: 'restore', ids: [Number(row.id)] });
    ElMessage.success(result?.message || '恢复成功');
    applyMonitorRestorePatch(extractAffectedIds(result, [Number(row.id)]));
    clearSelection();
    await ensureLocalPatchedPageStable(true);
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || '恢复归档失败');
  } finally {
    batchBusy.value = false;
  }
}

async function exportSelectedQrLinks() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  try {
    batchBusy.value = true;
    await exportAssetQrLinksWorkbook({
      rows: selectedRows.value,
      getId: (row) => Number(row.id),
      fetchBulkLinks: fetchBulkMonitorAssetQrLinks,
      loadExcelUtils,
      filename: `显示器二维码链接_${selectedCount.value}条.xlsx`,
      headers: [
        { key: 'id', title: 'ID' },
        { key: 'asset_code', title: '资产编号' },
        { key: 'sn', title: 'SN' },
        { key: 'brand', title: '品牌' },
        { key: 'model', title: '型号' },
        { key: 'status', title: '状态' },
        { key: 'url', title: '二维码链接' },
      ],
      mapWorkbookRow: (row, url) => ({
        id: row.id,
        asset_code: row.asset_code,
        sn: row.sn,
        brand: row.brand,
        model: row.model,
        status: assetStatusText(row.status),
        url,
      }),
    });
    ElMessage.success('二维码链接已导出');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码链接失败');
  } finally {
    batchBusy.value = false;
  }
}

async function executeExportSelectedQrCards(template?: Partial<QrPrintTemplate>) {
  try {
    exportBusy.value = true;
    startQrExportProgress('正在导出二维码标签');
    await exportSelectedQrCardsLocal(template);
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码卡片失败');
  } finally {
    exportBusy.value = false;
    finishQrExportProgress();
  }
}

function exportSelectedQrCards() {
  openQrPrintTemplate('cards');
}


async function confirmBatchRisk(title: string, message: string) {
  await ElMessageBox.confirm(message, title, {
    type: 'warning',
    confirmButtonText: '确认继续',
    cancelButtonText: '取消',
  });
}

async function exportBatchFailures(filename: string, rows: Array<Record<string, any>>) {
  if (!rows.length) return;
  const { exportToXlsx } = await loadExcelUtils();
  exportToXlsx({
    filename,
    sheetName: '失败明细',
    headers: Object.keys(rows[0]).map((key) => ({ key, title: key })),
    rows,
  });
}


function openBatchStatusDialog() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  batchStatusValue.value = 'IN_STOCK';
  warmLazyDialog(lazyBatchStatusDialog);
  batchStatusVisible.value = true;
}

async function openBatchLocationDialog() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  await ensureLocationOptionsReady();
  batchLocationValue.value = '';
  warmLazyDialog(lazyBatchLocationDialog);
  batchLocationVisible.value = true;
}

function openBatchOwnerDialog() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  batchOwnerForm.value = { employee_name: '', employee_no: '', department: '' };
  warmLazyDialog(lazyBatchOwnerDialog);
  batchOwnerVisible.value = true;
}

async function submitBatchStatus() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  try {
    batchBusy.value = true;
    const result: any = await apiPost('/api/monitor-assets-bulk', {
      action: 'status',
      ids: selectedIds.value.map((id) => Number(id)),
      status: batchStatusValue.value,
    });
    ElMessage.success(result?.message || '批量修改成功');
    notifyAction('批量状态已更新', `已处理 ${selectedCount.value} 台显示器的状态。`);
    batchStatusVisible.value = false;
    applyMonitorStatusPatch(extractAffectedIds(result), batchStatusValue.value);
    clearSelection();
    await ensureLocalPatchedPageStable();
  } catch (error: any) {
    ElMessage.error(error?.message || '批量修改状态失败');
  } finally {
    batchBusy.value = false;
  }
}

async function submitBatchLocation() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  if (!batchLocationValue.value) return ElMessage.warning('请选择目标位置');
  try {
    batchBusy.value = true;
    const result: any = await apiPost('/api/monitor-assets-bulk', {
      action: 'location',
      ids: selectedIds.value.map((id) => Number(id)),
      location_id: batchLocationValue.value,
    });
    ElMessage.success(result?.message || '批量修改成功');
    notifyAction('批量位置已更新', `已处理 ${selectedCount.value} 台显示器的位置。`);
    batchLocationVisible.value = false;
    applyMonitorLocationPatch(extractAffectedIds(result), batchLocationValue.value);
    clearSelection();
    await ensureLocalPatchedPageStable();
  } catch (error: any) {
    ElMessage.error(error?.message || '批量修改位置失败');
  } finally {
    batchBusy.value = false;
  }
}


async function submitBatchOwner() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  if (!String(batchOwnerForm.value.employee_name || '').trim()) return ElMessage.warning('请输入领用人');
  try {
    batchBusy.value = true;
    const result: any = await apiPost('/api/monitor-assets-bulk', {
      action: 'owner',
      ids: selectedIds.value.map((id) => Number(id)),
      employee_name: batchOwnerForm.value.employee_name,
      employee_no: batchOwnerForm.value.employee_no,
      department: batchOwnerForm.value.department,
    });
    ElMessage.success(result?.message || '批量修改领用人成功');
    notifyAction('批量领用人已更新', `已处理 ${selectedCount.value} 台显示器的领用信息。`);
    batchOwnerVisible.value = false;
    applyMonitorOwnerPatch(extractAffectedIds(result), batchOwnerForm.value);
    clearSelection();
    await ensureLocalPatchedPageStable();
  } catch (error: any) {
    ElMessage.error(error?.message || '批量修改领用人失败');
  } finally {
    batchBusy.value = false;
  }
}

async function batchRestoreSelected() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  try {
    await confirmBatchRisk('批量恢复归档', `预计恢复 ${selectedRows.value.filter((row) => Number(row.archived || 0) === 1).length} 台显示器。恢复后将重新出现在默认台账列表中，请输入“确认”继续。`);
    batchBusy.value = true;
    const result: any = await apiPost('/api/monitor-assets-bulk', {
      action: 'restore',
      ids: selectedIds.value.map((id) => Number(id)),
    });
    ElMessage.success(result?.message || '批量恢复成功');
    notifyAction('批量恢复完成', `已恢复 ${selectedCount.value} 台显示器。`, 'info');
    applyMonitorRestorePatch(extractAffectedIds(result));
    clearSelection();
    await ensureLocalPatchedPageStable(true);
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || '批量恢复归档失败');
  } finally {
    batchBusy.value = false;
  }
}

async function batchArchiveSelected() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  batchArchiveForm.value = { reason: systemSettings.value.warehouse_default_archive_reason || archiveReasonOptions.value[0] || '停用归档', note: '' };
  warmLazyDialog(lazyBatchArchiveDialog);
  batchArchiveVisible.value = true;
}

async function submitBatchArchive() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  if (!String(batchArchiveForm.value.reason || '').trim()) return ElMessage.warning('请选择归档原因');
  try {
    await confirmBatchRisk('批量归档确认', `此操作会归档选中的 ${selectedCount.value} 台显示器，默认列表将不再显示，请输入“确认”继续。`);
    batchBusy.value = true;
    const result: any = await apiPost('/api/monitor-assets-bulk', {
      action: 'archive',
      ids: selectedIds.value.map((id) => Number(id)),
      reason: batchArchiveForm.value.reason,
      note: batchArchiveForm.value.note,
    });
    ElMessage.success(result?.message || '批量归档成功');
    notifyAction('批量归档完成', `已归档 ${selectedCount.value} 台显示器。`, 'warning');
    batchArchiveVisible.value = false;
    applyMonitorArchivePatch(extractAffectedIds(result), batchArchiveForm.value);
    clearSelection();
    await ensureLocalPatchedPageStable(true);
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || '批量归档失败');
  } finally {
    batchBusy.value = false;
  }
}

async function batchDeleteSelected() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  try {
    const archivedCount = selectedRows.value.filter((row) => Number(row.archived || 0) === 1).length;
    await confirmBatchRisk('批量删除确认', buildBulkDeleteConfirmTip('显示器', selectedCount.value, archivedCount));
    batchBusy.value = true;
    const result: any = await withDestructiveActionFeedback('正在批量删除显示器台账', () => apiPost('/api/monitor-assets-bulk', {
      action: 'delete',
      ids: selectedIds.value.map((id) => Number(id)),
    }));
    const summary = summarizeBulkDeleteResult('显示器', result);
    if (summary.processed) clearSelection();
    if (summary.level === 'success') ElMessage.success(summary.message);
    else if (summary.level === 'warning') ElMessage.warning(summary.message);
    if (Array.isArray(result?.success_items)) applyMonitorDeletePatch(result.success_items);
    if (summary.failedRecords.length) await exportBatchFailures(`显示器批量删除失败明细_${summary.failedRecords.length}条.xlsx`, summary.failedRecords);
    await ensureLocalPatchedPageStable(true);
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || '批量删除失败');
  } finally {
    batchBusy.value = false;
  }
}

async function exportSelectedRows() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选要导出的显示器');
  try {
    exportBusy.value = true;
    const actions = await loadAssetLedgerExportActions();
    await actions.exportMonitorSelectedRows({ rows: selectedRows.value, loadExcelUtils, assetStatusText, locationText });
  } catch (error: any) {
    ElMessage.error(error?.message || '导出失败');
  } finally {
    exportBusy.value = false;
    finishQrExportProgress();
  }
}

async function exportExcel() {
  if (exportBusy.value) return;
  try {
    exportBusy.value = true;
    if (Number(total.value || 0) > 1000) ElMessage.info('数据量较大，正在分批导出，请稍候…');
    const all = await fetchAll(currentFiltersForList(), Number(total.value || 0) > 2000 ? 300 : 200);
    const actions = await loadAssetLedgerExportActions();
    await actions.exportMonitorAllRows({ rows: all, loadExcelUtils, assetStatusText, locationText });
  } catch (error: any) {
    ElMessage.error(error?.message || '导出失败');
  } finally {
    exportBusy.value = false;
  }
}


async function exportArchiveRecords() {
  if (exportBusy.value) return;
  try {
    exportBusy.value = true;
    const all = await fetchAll({ ...currentFiltersForList(), showArchived: true }, 200);
    const rowsToExport = all.filter((row) => Number(row.archived || 0) === 1);
    if (!rowsToExport.length) return ElMessage.warning('当前没有可导出的归档显示器记录');
    const actions = await loadAssetLedgerExportActions();
    await actions.exportMonitorArchiveRows({ rows: rowsToExport, loadExcelUtils, assetStatusText, locationText, formatBeijingDateTime });
    ElMessage.success('归档显示器记录已导出');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出归档记录失败');
  } finally {
    exportBusy.value = false;
  }
}

async function downloadMonitorTemplate() {
  const { downloadTemplate } = await loadExcelUtils();
  downloadTemplate({
    filename: '显示器台账导入模板.xlsx',
    headers: [
      { title: '资产编号' },
      { title: 'SN' },
      { title: '品牌' },
      { title: '型号' },
      { title: '尺寸' },
      { title: '位置' },
      { title: '备注' },
    ],
    exampleRows: [
      {
        资产编号: 'MON-001',
        SN: 'SN123456',
        品牌: 'Dell',
        型号: 'P2724H',
        尺寸: '27',
        位置: '总仓/办公区',
        备注: '示例，可删除该行',
      },
    ],
  });
}

async function onImportMonitorFile(uploadFile: any) {
  if (importBusy.value) return;
  const file: File = uploadFile?.raw;
  if (!file) return;
  try {
    importBusy.value = true;
    const { parseXlsx } = await loadExcelUtils();
    const excelRows = await parseXlsx(file);
    if (!excelRows.length) return ElMessage.warning('Excel里没有可导入的数据');

    const locationMap = new Map<string, number>();
    locationOptions.value.forEach((item) => {
      locationMap.set(String(item.label || '').trim(), Number(item.value));
      const tail = String(item.label || '').split('/').pop()?.trim();
      if (tail && !locationMap.has(tail)) locationMap.set(tail, Number(item.value));
    });

    let success = 0;
    let failed = 0;
    const errors: Array<{ row: number; msg: string }> = [];

    for (let index = 0; index < excelRows.length; index += 1) {
      const row: any = excelRows[index];
      const locationRaw = String(row['位置'] ?? row.location ?? '').trim();
      const payload = {
        asset_code: String(row['资产编号'] ?? row.asset_code ?? '').trim(),
        sn: String(row.SN ?? row.sn ?? '').trim(),
        brand: String(row['品牌'] ?? row.brand ?? '').trim(),
        model: String(row['型号'] ?? row.model ?? '').trim(),
        size_inch: String(row['尺寸'] ?? row.size_inch ?? '').trim(),
        location_id: locationRaw ? locationMap.get(locationRaw) || null : null,
        remark: String(row['备注'] ?? row.remark ?? '').trim(),
      };
      if (!payload.asset_code) continue;
      try {
        await apiPost('/api/monitor-assets', payload);
        success += 1;
      } catch (error: any) {
        failed += 1;
        errors.push({ row: index + 2, msg: error?.message || '导入失败' });
      }
    }

    if (success === 0 && failed === 0) return ElMessage.warning('Excel里没有可导入的数据');
    if (failed > 0) {
      console.warn('monitor-assets import errors', errors);
      ElMessage.warning(`导入完成：成功 ${success} 条，失败 ${failed} 条（详情见控制台）`);
    } else {
      ElMessage.success(`导入完成：成功 ${success} 条`);
    }
    await refreshCurrent(true, true);
  } catch (error: any) {
    ElMessage.error(error?.message || '导入失败');
  } finally {
    importBusy.value = false;
  }
}

const dlgAsset = reactive({
  show: false,
  mode: 'create' as 'create' | 'edit',
  form: {
    id: 0,
    asset_code: '',
    sn: '',
    brand: '',
    model: '',
    size_inch: '',
    remark: '',
    location_id: '' as any,
  },
});


async function refreshMonitorBrandOptions(force = false) {
  try {
    systemSettings.value = await fetchSystemSettings(force ? { force: true } : undefined);
    if (force) markMonitorBrandSettingsApplied();
  } catch {}
}

async function initMonitorBrandOptions() {
  const hasCachedBrands = Array.isArray(systemSettings.value?.dictionary_monitor_brand_options) && systemSettings.value.dictionary_monitor_brand_options.length > 0;
  const shouldForce = shouldRefreshMonitorBrandSettings();
  if (shouldForce) {
    await refreshMonitorBrandOptions(true);
    return;
  }
  if (!hasCachedBrands) {
    await refreshMonitorBrandOptions(false);
  }
}

function closeAssetDialog() {
  if (assetSaving.value) return;
  dlgAsset.show = false;
}

async function openCreate() {
  await ensureLocationOptionsReady();
  if (!monitorBrandOptions.value.length) void refreshMonitorBrandOptions(true);
  dlgAsset.mode = 'create';
  dlgAsset.form = { id: 0, asset_code: '', sn: '', brand: '', model: '', size_inch: '', remark: '', location_id: '' as any };
  warmLazyDialog(lazyAssetDialog);
  dlgAsset.show = true;
}

function openInfo(row: MonitorAsset) {
  infoRow.value = { ...row };
  warmLazyDialog(lazyInfoDialog);
  infoVisible.value = true;
}

async function openEdit(row: MonitorAsset) {
  await ensureLocationOptionsReady();
  if (!monitorBrandOptions.value.length) void refreshMonitorBrandOptions(true);
  dlgAsset.mode = 'edit';
  dlgAsset.form = {
    id: row.id,
    asset_code: row.asset_code || '',
    sn: row.sn || '',
    brand: row.brand || '',
    model: row.model || '',
    size_inch: row.size_inch || '',
    remark: row.remark || '',
    location_id: row.location_id || '',
  } as any;
  warmLazyDialog(lazyAssetDialog);
  dlgAsset.show = true;
}

async function saveAsset() {
  if (assetSaving.value) return;
  const trim = (value: unknown) => String(value ?? '').trim();
  const sizePattern = /^\d+(\.\d{1,2})?(\s*寸)?$/;
  const payload = {
    ...dlgAsset.form,
    asset_code: trim(dlgAsset.form.asset_code),
    sn: trim(dlgAsset.form.sn),
    brand: trim(dlgAsset.form.brand),
    model: trim(dlgAsset.form.model),
    size_inch: trim(dlgAsset.form.size_inch),
    remark: trim(dlgAsset.form.remark),
    location_id: dlgAsset.form.location_id || '',
  } as any;

  if (!payload.asset_code) return ElMessage.warning('资产编号必填');
  if (!payload.brand) return ElMessage.warning('品牌必填');
  if (!payload.model) return ElMessage.warning('型号必填');
  if (payload.size_inch && !sizePattern.test(payload.size_inch)) return ElMessage.warning('尺寸请填写数字或“27寸”这类格式');

  assetSaving.value = true;
  dlgAsset.form = { ...payload };
  try {
    if (dlgAsset.mode === 'create') {
      await apiPost('/api/monitor-assets', payload);
      ElMessage.success('新增成功');
      notifyAction('显示器已新增', `已创建 ${payload.asset_code || '新显示器'}。`);
      dlgAsset.show = false;
      await refreshCurrent(true, true);
    } else {
      await apiPut('/api/monitor-assets', payload);
      ElMessage.success('保存成功');
      notifyAction('显示器已更新', `已更新 ${payload.asset_code || '显示器记录'}。`);
      dlgAsset.show = false;
      if (systemSettings.value.ui_write_local_refresh) {
        patchCurrentRows([Number(payload.id)], (row) => ({
          ...row,
          asset_code: payload.asset_code,
          sn: payload.sn,
          brand: payload.brand,
          model: payload.model,
          size_inch: payload.size_inch || '',
          remark: payload.remark || '',
          location_id: payload.location_id || null,
          ...findLocationParts(Number(payload.location_id || 0) || 0),
        }));
        await ensureLocalPatchedPageStable(false);
      } else {
        await refreshCurrent(true, true);
      }
    }
  } catch (error: any) {
    try {
      await handleMaybeMissingSchema(error);
    if (dlgAsset.mode === 'create') {
      await apiPost('/api/monitor-assets', payload);
      ElMessage.success('新增成功');
      notifyAction('显示器已新增', `已创建 ${payload.asset_code || '新显示器'}。`);
      dlgAsset.show = false;
      await refreshCurrent(true, true);
    } else {
      await apiPut('/api/monitor-assets', payload);
      ElMessage.success('保存成功');
      notifyAction('显示器已更新', `已更新 ${payload.asset_code || '显示器记录'}。`);
      dlgAsset.show = false;
      if (systemSettings.value.ui_write_local_refresh) {
        patchCurrentRows([Number(payload.id)], (row) => ({
          ...row,
          asset_code: payload.asset_code,
          sn: payload.sn,
          brand: payload.brand,
          model: payload.model,
          size_inch: payload.size_inch || '',
          remark: payload.remark || '',
          location_id: payload.location_id || null,
          ...findLocationParts(Number(payload.location_id || 0) || 0),
        }));
        await ensureLocalPatchedPageStable(false);
      } else {
        await refreshCurrent(true, true);
      }
    }
    } catch (nextError: any) {
      ElMessage.error(nextError.message || '操作失败');
    }
  } finally {
    assetSaving.value = false;
  }
}

async function removeAsset(row: MonitorAsset) {
  const isArchived = Number(row.archived || 0) === 1;
  const label = `${[row.brand, row.model].filter(Boolean).join(' ')}（资产编号: ${row.asset_code || '-'}）`;
  try {
    const preview: any = await apiPost('/api/monitor-assets-bulk', { action: 'delete', ids: [Number(row.id)], preview_only: true });
    const previewItem = Array.isArray(preview?.data?.items) ? preview.data.items[0] : null;
    if (previewItem?.blocked) {
      throw Object.assign(new Error(String(previewItem?.reason || '当前资产暂不支持删除')), { status: 400 });
    }
    const operation = String(previewItem?.operation || (isArchived ? 'purge' : 'delete'));
    const relatedTotal = Number(previewItem?.related_total || 0);
    const reason = String(previewItem?.reason || '');
    const message = operation === 'purge'
      ? `确认彻底删除归档显示器：${label}？本次将清理 ${relatedTotal} 条关联记录。${reason}`
      : operation === 'archive'
        ? `确认删除显示器台账：${label}？预检结果：本次不会物理删除，而会自动归档。${reason}`
        : `确认删除显示器台账：${label}？预检结果：满足物理删除条件。`;
    await ElMessageBox.confirm(message, operation === 'purge' ? '彻底删除预检' : '删除预检', {
      type: 'warning',
      confirmButtonText: operation === 'purge' ? '确认彻底删除' : '确认删除',
      cancelButtonText: '取消',
    });
    batchBusy.value = true;
    const result: any = await withDestructiveActionFeedback('正在删除显示器台账', () => apiPost('/api/monitor-assets-bulk', { action: 'delete', ids: [Number(row.id)] }));
    if (Array.isArray(result?.success_items)) applyMonitorDeletePatch(result.success_items);
    clearSelection();
    await ensureLocalPatchedPageStable(true);
    if (result?.failed) {
      const failure = Array.isArray(result?.failed_records) ? result.failed_records[0] : null;
      throw Object.assign(new Error(String(failure?.原因 || result?.message || '删除失败')), { status: 400 });
    }
    ElMessage.success(result?.message || (isArchived ? '彻底删除成功' : '删除成功'));
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || (isArchived ? '彻底删除失败' : '删除失败'));
  } finally {
    batchBusy.value = false;
  }
}

const infoVisible = ref(false);
const infoRow = ref<MonitorAsset | null>(null);

const dlgOp = reactive({
  show: false,
  kind: 'in' as 'in' | 'out' | 'return' | 'transfer',
  title: '',
  asset: null as MonitorAsset | null,
  form: {
    location_id: '' as any,
    employee_no: '',
    employee_name: '',
    department: '',
    remark: '',
  },
});

async function openIn(row: MonitorAsset) {
  await ensureLocationOptionsReady();
  dlgOp.kind = 'in';
  dlgOp.title = '显示器入库';
  dlgOp.asset = row;
  dlgOp.form = { location_id: row.location_id || '', employee_no: '', employee_name: '', department: '', remark: '' };
  warmLazyDialog(lazyOperationDialog);
  dlgOp.show = true;
}

async function openOut(row: MonitorAsset) {
  await ensureLocationOptionsReady();
  dlgOp.kind = 'out';
  dlgOp.title = '显示器出库（领用）';
  dlgOp.asset = row;
  dlgOp.form = { location_id: row.location_id || '', employee_no: '', employee_name: '', department: '', remark: '' };
  warmLazyDialog(lazyOperationDialog);
  dlgOp.show = true;
}

async function openReturn(row: MonitorAsset) {
  await ensureLocationOptionsReady();
  dlgOp.kind = 'return';
  dlgOp.title = '显示器归还';
  dlgOp.asset = row;
  dlgOp.form = { location_id: row.location_id || '', employee_no: '', employee_name: '', department: '', remark: '' };
  warmLazyDialog(lazyOperationDialog);
  dlgOp.show = true;
}

async function openTransfer(row: MonitorAsset) {
  await ensureLocationOptionsReady();
  dlgOp.kind = 'transfer';
  dlgOp.title = '显示器调拨';
  dlgOp.asset = row;
  dlgOp.form = { location_id: row.location_id || '', employee_no: '', employee_name: '', department: '', remark: '' };
  warmLazyDialog(lazyOperationDialog);
  dlgOp.show = true;
}

async function submitOp() {
  const asset = dlgOp.asset;
  if (!asset || opSubmitting.value) return;
  try {
    opSubmitting.value = true;
    if (dlgOp.kind === 'in') {
      await apiPost('/api/monitor-in', { asset_id: asset.id, location_id: dlgOp.form.location_id || null, remark: dlgOp.form.remark });
      ElMessage.success('入库成功');
    } else if (dlgOp.kind === 'out') {
      await apiPost('/api/monitor-out', {
        asset_id: asset.id,
        location_id: dlgOp.form.location_id || null,
        employee_no: dlgOp.form.employee_no,
        employee_name: dlgOp.form.employee_name,
        department: dlgOp.form.department,
        remark: dlgOp.form.remark,
      });
      ElMessage.success('出库成功');
    } else if (dlgOp.kind === 'return') {
      await apiPost('/api/monitor-return', { asset_id: asset.id, location_id: dlgOp.form.location_id || null, remark: dlgOp.form.remark });
      ElMessage.success('归还成功');
    } else if (dlgOp.kind === 'transfer') {
      await apiPost('/api/monitor-transfer', { asset_id: asset.id, to_location_id: dlgOp.form.location_id, remark: dlgOp.form.remark });
      ElMessage.success('调拨成功');
    }
    dlgOp.show = false;
    if (systemSettings.value.ui_write_local_refresh) {
      const assetId = Number(asset.id);
      if (dlgOp.kind === 'in') {
        applyMonitorStatusPatch([assetId], 'IN_STOCK');
        applyMonitorLocationPatch([assetId], dlgOp.form.location_id || '');
        applyMonitorOwnerPatch([assetId], { employee_name: '', employee_no: '', department: '' });
      } else if (dlgOp.kind === 'out') {
        applyMonitorStatusPatch([assetId], 'ASSIGNED');
        applyMonitorLocationPatch([assetId], dlgOp.form.location_id || '');
        applyMonitorOwnerPatch([assetId], { employee_name: dlgOp.form.employee_name, employee_no: dlgOp.form.employee_no, department: dlgOp.form.department });
      } else if (dlgOp.kind === 'return') {
        applyMonitorStatusPatch([assetId], 'IN_STOCK');
        applyMonitorLocationPatch([assetId], dlgOp.form.location_id || '');
        applyMonitorOwnerPatch([assetId], { employee_name: '', employee_no: '', department: '' });
      } else if (dlgOp.kind === 'transfer') {
        applyMonitorLocationPatch([assetId], dlgOp.form.location_id || '');
      }
      await ensureLocalPatchedPageStable(false);
    } else {
      await refreshCurrent(true, true);
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '操作失败');
  } finally {
    opSubmitting.value = false;
  }
}

const qrVisible = ref(false);


const qrLoading = ref(false);
const qrRow = ref<MonitorAsset | null>(null);
const qrLink = ref('');
const qrDataUrl = ref('');
const qrSvgMarkup = ref('');

function monitorQrVersionOf(row?: Partial<MonitorAsset> | null) {
  return String(row?.qr_updated_at || row?.updated_at || '');
}


function buildMonitorQrSheetRecord(row: MonitorAsset, url: string, template?: Partial<QrPrintTemplate>) {
  if (!url) return null;
  const mode = template?.content_mode || 'detail';
  const modelText = [row.brand, row.model].filter(Boolean).join(' ') || `显示器 #${row.id}`;
  const assetCode = row.asset_code || '-';
  const sn = row.sn || '-';
  if (mode === 'qr_only') return { title: '', subtitle: '', meta: [], url };
  if (mode === 'model_sn') return { title: modelText, subtitle: `SN：${sn}`, meta: [], url };
  if (mode === 'model_asset') return { title: modelText, subtitle: `资产编号：${assetCode}`, meta: [], url };
  return {
    title: assetCode || `显示器 #${row.id}`,
    subtitle: [row.brand, row.model].filter(Boolean).join(' · ') || `SN：${sn}`,
    meta: [
      { label: '状态', value: assetStatusText(row.status) },
      { label: '位置', value: locationText(row) },
      { label: '领用人', value: row.employee_name || '-' },
      { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
    ],
    url,
  };
}

function buildMonitorQrCardRecord(row: MonitorAsset, url: string, template?: Partial<QrPrintTemplate>) {
  if (!url) return null;
  const mode = template?.content_mode || 'detail';
  const modelText = [row.brand, row.model].filter(Boolean).join(' ') || `显示器 #${row.id}`;
  const assetCode = row.asset_code || '-';
  const sn = row.sn || '-';
  if (mode === 'qr_only') return { title: '', subtitle: '', meta: [], url };
  if (mode === 'model_sn') return { title: modelText, subtitle: `SN：${sn}`, meta: [], url };
  if (mode === 'model_asset') return { title: modelText, subtitle: `资产编号：${assetCode}`, meta: [], url };
  return {
    title: `${row.asset_code || '-'} ${row.brand || ''}`.trim(),
    subtitle: `${row.model || '-'} · SN：${sn}`,
    meta: [
      { label: '状态', value: assetStatusText(row.status) },
      { label: '位置', value: locationText(row) },
      { label: '领用人', value: row.employee_name || '-' },
    ],
    url,
  };
}

async function exportSingleMonitorQrSheet(template?: Partial<QrPrintTemplate>) {
  if (!qrRow.value) return;
  const result = await exportAssetQrPrintLocal({
    mode: 'sheet',
    rows: [qrRow.value],
    getId: (row) => Number(row.id),
    fetchBulkLinks: fetchBulkMonitorAssetQrLinks,
    mapPrintRecord: (row, url) => buildMonitorQrSheetRecord(row, url, template),
    loadQrCardUtils,
    filename: buildQrExportFilename({ scope: 'monitor', kind: 'sheet', count: 1, template, singleLabel: `显示器二维码_${qrRow.value.asset_code || qrRow.value.id || 'monitor'}` }),
    title: '显示器二维码',
    template,
    onProgress: updateQrExportProgress,
  });
  if (result.empty) return ElMessage.warning('当前记录没有可导出的二维码');
  ElMessage.success('二维码打印页已导出，可直接打印');
}

async function exportSingleMonitorQrCard(template?: Partial<QrPrintTemplate>) {
  if (!qrRow.value) return;
  const result = await exportAssetQrPrintLocal({
    mode: 'cards',
    rows: [qrRow.value],
    getId: (row) => Number(row.id),
    fetchBulkLinks: fetchBulkMonitorAssetQrLinks,
    mapPrintRecord: (row, url) => buildMonitorQrCardRecord(row, url, template),
    loadQrCardUtils,
    filename: buildQrExportFilename({ scope: 'monitor', kind: 'cards', count: 1, template, singleLabel: `显示器标签_${qrRow.value.asset_code || qrRow.value.id || 'monitor'}` }),
    title: '显示器标签',
    template,
    onProgress: updateQrExportProgress,
  });
  if (result.empty) return ElMessage.warning('当前记录没有可导出的二维码');
  ElMessage.success('标签打印页已导出，可直接打印');
}

async function exportSelectedQrSheetLocal(template?: Partial<QrPrintTemplate>) {
  const result = await exportAssetQrPrintLocal({
    mode: 'sheet',
    rows: selectedRows.value,
    getId: (row) => Number(row.id),
    fetchBulkLinks: fetchBulkMonitorAssetQrLinks,
    mapPrintRecord: (row, url) => buildMonitorQrSheetRecord(row, url, template),
    loadQrCardUtils,
    filename: buildQrExportFilename({ scope: 'monitor', kind: 'sheet', count: selectedRows.value.length, template }),
    title: '显示器二维码图版',
    template,
    onProgress: updateQrExportProgress,
  });
  if (result.empty) return ElMessage.warning('当前选中项没有可导出的二维码');
  ElMessage.success('二维码图版打印页已导出，可直接打印');
}

async function exportSelectedQrCardsLocal(template?: Partial<QrPrintTemplate>) {
  const result = await exportAssetQrPrintLocal({
    mode: 'cards',
    rows: selectedRows.value,
    getId: (row) => Number(row.id),
    fetchBulkLinks: fetchBulkMonitorAssetQrLinks,
    mapPrintRecord: (row, url) => buildMonitorQrCardRecord(row, url, template),
    loadQrCardUtils,
    filename: buildQrExportFilename({ scope: 'monitor', kind: 'cards', count: selectedRows.value.length, template }),
    title: '显示器二维码卡片',
    template,
    onProgress: updateQrExportProgress,
  });
  if (result.empty) return ElMessage.warning('当前选中项没有可导出的二维码');
  ElMessage.success('二维码卡片已导出，可直接打印');
}

function openQrPrintTemplate(kind: QrPrintTemplateKind, action?: 'batch-cards' | 'batch-sheet' | 'single-cards' | 'single-sheet') {
  if (!canQrExport.value) return ElMessage.warning('当前账号没有二维码/标签导出权限');
  const nextAction = action || (kind === 'cards' ? 'batch-cards' : 'batch-sheet');
  if (nextAction.startsWith('batch') && !selectedCount.value) return ElMessage.warning('请先勾选显示器');
  if (nextAction.startsWith('single') && !qrRow.value?.id) return ElMessage.warning('请先打开要导出的二维码');
  qrTemplateKind.value = kind;
  qrTemplateAction.value = nextAction;
  qrTemplateVisible.value = true;
}

async function submitQrPrintTemplate(template: QrPrintTemplate) {
  if (qrTemplateAction.value === 'single-cards') {
    try {
      startQrExportProgress('正在导出二维码标签');
      await exportSingleMonitorQrCard(template);
    } finally {
      finishQrExportProgress();
    }
    return;
  }
  if (qrTemplateAction.value === 'single-sheet') {
    try {
      startQrExportProgress('正在导出二维码图版');
      await exportSingleMonitorQrSheet(template);
    } finally {
      finishQrExportProgress();
    }
    return;
  }
  if (qrTemplateKind.value === 'cards') {
    await executeExportSelectedQrCards(template);
    return;
  }
  await executeExportSelectedQrSheet(template);
}

async function executeExportSelectedQrSheet(template?: Partial<QrPrintTemplate>) {
  try {
    exportBusy.value = true;
    startQrExportProgress('正在导出二维码图版');
    await exportSelectedQrSheetLocal(template);
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码图版失败');
  } finally {
    exportBusy.value = false;
  }
}

function exportSelectedQrPng() {
  openQrPrintTemplate('sheet');
}

function openAuditHistory(row?: MonitorAsset | null) {
  const id = Number(row?.id || infoRow.value?.id || 0);
  if (!id) return;
  infoVisible.value = false;
  router.push({ path: '/system/audit', query: { entity: 'monitor_assets', entity_id: String(id), module: 'MONITOR' } });
}

async function openQr(row: MonitorAsset) {
  warmLazyDialog(lazyQrDialog);
  qrVisible.value = true;
  qrRow.value = { ...row };
  qrLink.value = '';
  qrDataUrl.value = '';
  qrSvgMarkup.value = '';
  qrLoading.value = true;
  try {
    const id = Number(row?.id || 0);
    if (!id) throw new Error('缺少资产ID');
    const version = monitorQrVersionOf(row);
    const cached = getCachedAssetQr('monitor', id, version);
    if (cached) {
      qrLink.value = cached.link;
      qrDataUrl.value = cached.dataUrl;
      qrSvgMarkup.value = cached.svgMarkup || '';
      return;
    }
    const result: any = await apiGet(`/api/monitor-asset-qr-token?id=${encodeURIComponent(String(id))}`);
    const link = String(result?.url || '');
    qrLink.value = link;
    if (link) {
      const qrImage = await buildInlineQrSvg(link, 360);
      qrDataUrl.value = qrImage.dataUrl;
      qrSvgMarkup.value = qrImage.svgMarkup;
      setCachedAssetQr('monitor', id, version, { link, dataUrl: qrImage.dataUrl, svgMarkup: qrImage.svgMarkup });
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '生成二维码失败');
  } finally {
    qrLoading.value = false;
  }
}

function downloadQr() {
  openQrPrintTemplate('sheet', 'single-sheet');
}

function downloadLabel() {
  openQrPrintTemplate('cards', 'single-cards');
}

async function copyQrLink() {
  try {
    await navigator.clipboard.writeText(qrLink.value || '');
    ElMessage.success('已复制');
  } catch {
    ElMessage.warning('复制失败，请手动复制');
  }
}

const openQrInNewTab = () => {
  if (qrLink.value) window.open(qrLink.value, '_blank');
};

async function resetQr() {
  if (!canQrReset.value) return ElMessage.warning('当前账号没有重置二维码权限');
  try {
    const id = Number(qrRow.value?.id || 0);
    if (!id) return;
    await ElMessageBox.confirm('重置后旧二维码将立即失效，确认继续？', '重置二维码', {
      type: 'warning',
      confirmButtonText: '重置',
      cancelButtonText: '取消',
    });
    qrLoading.value = true;
    invalidateAssetQr('monitor', id);
    const result: any = await apiPost(`/api/monitor-assets-reset-qr?id=${id}`, {});
    const link = String(result?.url || '');
    qrLink.value = link;
    if (link) {
      const qrImage = await buildInlineQrSvg(link, 360);
      qrDataUrl.value = qrImage.dataUrl;
      qrSvgMarkup.value = qrImage.svgMarkup;
      const version = new Date().toISOString();
      qrRow.value = qrRow.value ? { ...qrRow.value, qr_updated_at: version } : qrRow.value;
      setCachedAssetQr('monitor', id, version, { link, dataUrl: qrImage.dataUrl, svgMarkup: qrImage.svgMarkup });
    }
    ElMessage.success('已重置');
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || '重置失败');
  } finally {
    qrLoading.value = false;
  }
}

async function initQrKeys() {
  if (initQrBusy.value) return;
  try {
    await ElMessageBox.confirm('将把“补齐显示器二维码 Key”提交到异步任务中心后台执行。继续？', '初始化二维码Key', {
      type: 'warning',
      confirmButtonText: '继续',
      cancelButtonText: '取消',
    });
    initQrBusy.value = true;
    const result: any = await apiPost('/api/jobs', { job_type: 'MONITOR_QR_KEY_INIT', request_json: { batch_size: 50 }, retain_days: 7, max_retries: 1 });
    const jobId = Number(result?.data?.id || result?.id || 0);
    ElMessage.success(jobId ? `任务已创建（#${jobId}），可在“系统工具 / 异步任务”查看进度` : '任务已创建，可在“系统工具 / 异步任务”查看进度');
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || '初始化失败');
  } finally {
    initQrBusy.value = false;
  }
}

const dlgLoc = reactive({ show: false, rows: [] as MonitorAsset[], newName: '', parentId: '' as any });

function buildLocLabel(row: MonitorAsset) {
  const parent = locations.value.find((item) => item.id === row.parent_id);
  return [parent?.name, row.name].filter(Boolean).join('/');
}

async function openLocationMgr() {
  warmLazyDialog(lazyLocationDialog);
  dlgLoc.show = true;
  await refreshLocationMgr();
}

async function refreshLocationMgr(force = false) {
  try {
    const rows = await ensureAllLocations(force);
    dlgLoc.rows = rows.map((item) => ({ ...item })) as MonitorAsset[];
  } catch (error: any) {
    await handleMaybeMissingSchema(error);
    dlgLoc.rows = [];
  }
}

async function createLocation() {
  if (locationSaving.value) return;
  try {
    locationSaving.value = true;
    if (!dlgLoc.newName.trim()) return ElMessage.warning('请输入位置名称');
    await apiPost('/api/pc-locations', { name: dlgLoc.newName.trim(), parent_id: dlgLoc.parentId || null });
    dlgLoc.newName = '';
    dlgLoc.parentId = '';
    invalidateLocationCatalog();
    await refreshLocationMgr(true);
    ElMessage.success('新增成功');
  } catch (error: any) {
    ElMessage.error(error.message || '新增失败');
  } finally {
    locationSaving.value = false;
  }
}

async function updateLocation(row: MonitorAsset) {
  if (locationSaving.value) return;
  try {
    locationSaving.value = true;
    await apiPut('/api/pc-locations', { id: row.id, name: row.name, parent_id: row.parent_id, enabled: row.enabled });
    invalidateLocationCatalog();
    await refreshLocationMgr(true);
    ElMessage.success('保存成功');
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败');
  } finally {
    locationSaving.value = false;
  }
}

async function deleteLocation(row: MonitorAsset) {
  if (locationSaving.value) return;
  try {
    locationSaving.value = true;
    await ElMessageBox.confirm('删除位置后无法恢复，确认继续？', '提示', { type: 'warning' });
    await apiDelete('/api/pc-locations', { id: row.id, confirm: '删除' });
    invalidateLocationCatalog();
    await refreshLocationMgr(true);
    ElMessage.success('删除成功');
  } catch (error: any) {
    if (error?.message) ElMessage.error(error.message);
  } finally {
    locationSaving.value = false;
  }
}

function onSelectionChange(currentPageSelected: MonitorAsset[]) {
  syncPageSelection(rows.value, currentPageSelected);
}

function resetFilters() {
  runWithoutAutoSearch(() => {
    status.value = '';
    locationId.value = '';
    inventoryStatus.value = '';
    keyword.value = '';
    showArchived.value = false;
    archiveMode.value = 'active';
    archiveReason.value = '';
  });
  void refreshLedgerData();
}

function setInventoryFilter(nextStatus: string) {
  const normalized = String(nextStatus || '');
  inventoryStatus.value = inventoryStatus.value === normalized ? '' : normalized;
  reloadList();
}

function openRecommendedAction(command: string, row: MonitorAsset) {
  if (command === 'transfer') return openTransfer(row);
  if (command === 'return') return openReturn(row);
  if (command === 'qr') return openQr(row);
  const keywordText = String(row?.asset_code || row?.sn || row?.brand || row?.model || row?.id || '').trim();
  void router.push({
    path: '/pc/monitor-inventory-logs',
    query: { action: 'ISSUE', issue_type: String(row?.inventory_issue_type || ''), keyword: keywordText },
  });
}








async function hydrateViewData(options: { keepPage?: boolean; silent?: boolean } = {}) {
  const shouldRefreshBatch = Number(inventoryBatchLoadedAt.value || 0) <= 0 || (Date.now() - Number(inventoryBatchLoadedAt.value || 0)) >= INVENTORY_BATCH_SOFT_TTL_MS;
  await refreshLedgerData(options);
  if (!shouldRefreshBatch) return;
  runWhenBrowserIdle(async () => {
    try {
      await refreshInventoryBatch();
      const nextFilters = currentFiltersForList();
      if (shouldLoadInventorySummary(nextFilters)) void refreshInventorySummary(nextFilters);
    } catch {}
  }, 1500);
}

function handleViewportResize() {
  isMobile.value = typeof window !== 'undefined' ? window.innerWidth <= 900 : false;
}

onBeforeMount(() => {
  handleViewportResize();
  if (typeof window !== 'undefined') window.addEventListener('resize', handleViewportResize, { passive: true });
  void hydrateViewData();
});

onMounted(() => {
  if (locationId.value) {
    void ensureLocationOptionsReady();
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', handleViewportResize);
  clearQrExportProgressAutoCloseTimer();
  cleanupViewState();
});

onActivated(() => {
  if (Date.now() - lastRefreshAt < SOFT_REFRESH_TTL_MS) return;
  void hydrateViewData({ keepPage: true, silent: true });
});
</script>

<style scoped>
.ledger-page {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ledger-page::before {
  content: '';
  position: absolute;
  inset: -18px -18px auto;
  height: 220px;
  border-radius: 30px;
  background:
    radial-gradient(circle at top left, rgba(103, 194, 58, 0.11), transparent 36%),
    radial-gradient(circle at top right, rgba(64, 158, 255, 0.14), transparent 34%),
    linear-gradient(180deg, rgba(248, 250, 255, 0.96), rgba(255, 255, 255, 0));
  pointer-events: none;
}

.ledger-section {
  position: relative;
  z-index: 1;
}

.ledger-section--table::before {
  content: '';
  position: absolute;
  inset: 12px 20px auto 20px;
  height: 72px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(64, 158, 255, 0.08), rgba(64, 158, 255, 0));
  filter: blur(10px);
  pointer-events: none;
}

:deep(.ledger-toolbar-card),
:deep(.ledger-table-card) {
  position: relative;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 28px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(246, 249, 255, 0.94) 100%);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.10);
}

:deep(.ledger-toolbar-card > .el-card__body),
:deep(.ledger-table-card > .el-card__body) {
  padding: 18px;
}

:deep(.ledger-toolbar-card::after),
:deep(.ledger-table-card::after) {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
}

.batch-preview {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.batch-help {
  color: #909399;
  font-size: 12px;
  padding-left: 4px;
}

@media (max-width: 768px) {
  .ledger-page {
    gap: 14px;
  }

  :deep(.ledger-toolbar-card > .el-card__body),
  :deep(.ledger-table-card > .el-card__body) {
    padding: 14px;
  }
}
</style>
