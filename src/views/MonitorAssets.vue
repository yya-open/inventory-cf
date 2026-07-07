<template>
  <div class="ui-page-shell ledger-page ledger-page--monitor">
    <section class="ui-page-heading ledger-page-heading">
      <div class="ui-page-heading__main">
        <div class="ui-page-heading__kicker">电脑/显示器仓</div>
        <div class="ui-page-heading__title">显示器台账</div>
        <div class="ui-page-heading__desc">统一维护显示器资产、位置、领用信息、二维码与盘点异常处理。</div>
      </div>
      <div class="ledger-page-heading__meta">
        <el-tag type="info" effect="plain">共 {{ total }} 台</el-tag>
        <el-tag v-if="selectedCount" type="primary" effect="plain">已选 {{ selectedCount }} 台</el-tag>
        <el-tag v-if="hasActiveInventoryBatch" type="warning" effect="plain">盘点中</el-tag>
      </div>
    </section>

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
      :can-bulk-operation="canBulkOperation"
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
      :default-view-name="defaultViewName"
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
      @set-default-view="handleSetDefaultView"
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
      :can-bulk-operation="canBulkOperation"
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
import { withBlockingActionFeedback } from '../utils/operationFeedback';
import { withDestructiveActionFeedback } from '../utils/destructiveAction';
import { countMonitorAssets, getMonitorAssetInventorySummary, invalidateAssetInventorySummaryCache, listMonitorAssets } from '../api/assetLedgers';
import { invalidateAssetHistoryCache } from '../api/assetHistory';
import { useInventoryBatchStore } from '../composables/useInventoryBatchStore';
import type { InventoryBatchPayload } from '../api/inventoryBatches';
import { useAssetLedgerPage } from '../composables/useAssetLedgerPage';
import { useCrossPageSelection } from '../composables/useCrossPageSelection';
import { useAssetSelectionSummary } from '../composables/useAssetSelectionSummary';
import { useAssetBulkActions } from '../composables/useAssetBulkActions';
import { trimText, useAssetFormActions } from '../composables/useAssetFormActions';
import { useMonitorAssetForm } from '../composables/useMonitorAssetForm';
import { useMonitorAssetQr } from '../composables/useMonitorAssetQr';
import { can, canCapability, canPerm } from '../store/auth';
import type { AssetInventorySummary, LocationRow, MonitorAsset, MonitorFilters } from '../types/assets';
import { assetStatusText, inventoryIssueTypeText, inventoryStatusText } from '../types/assets';
import { formatBeijingDateTime } from '../utils/datetime';
import { fetchSystemSettings, getCachedSystemSettings, markMonitorBrandSettingsApplied, shouldRefreshMonitorBrandSettings } from '../api/systemSettings';
import MonitorAssetsToolbar from '../components/assets/MonitorAssetsToolbar.vue';
import MonitorAssetsTable from '../components/assets/MonitorAssetsTable.vue';
import type { AssetQrExportProgress } from '../utils/assetQrExport';
import { useLocationCatalog } from '../composables/useLocationCatalog';
import { useMonitorAssetViewState } from './assets/monitorAssetViewState';
import { createAssetPagePatchController, applyGenericArchivePatch, applyGenericDeletePatch, applyGenericRestorePatch } from './assets/assetLocalPatch';
import { extractAffectedIds } from './assets/assetBulkActions';
import { isLedgerMobileViewport } from '../utils/responsive';
import { useBrowserIdleTask } from '../composables/useBrowserIdleTask';
import { useAssetLedgerBatchRefresh } from '../composables/useAssetLedgerBatchRefresh';
import { useAssetBulkDialogs } from '../composables/useAssetBulkDialogs';
import { useAssetImportExport } from '../composables/useAssetImportExport';
import { useQrExportProgress } from '../composables/useQrExportProgress';

const MonitorAssetFormDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetFormDialog.vue'));
const MonitorAssetInfoDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetInfoDialog.vue'));
const MonitorAssetOperationDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetOperationDialog.vue'));
const MonitorAssetQrDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetQrDialog.vue'));
const MonitorLocationManagerDialog = defineAsyncComponent(() => import('../components/assets/MonitorLocationManagerDialog.vue'));
const MonitorAssetBatchStatusDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetBatchStatusDialog.vue'));
const MonitorAssetBatchLocationDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetBatchLocationDialog.vue'));
const MonitorAssetBatchOwnerDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetBatchOwnerDialog.vue'));
const MonitorAssetBatchArchiveDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetBatchArchiveDialog.vue'));
const QrPrintTemplateDialog = defineAsyncComponent(() => import('../components/assets/QrPrintTemplateDialog.vue'));
const QrExportProgressDialog = defineAsyncComponent(() => import('../components/assets/QrExportProgressDialog.vue'));

const { enabledLocations: locations, ensureEnabledLocations, ensureAllLocations, invalidateLocationCatalog } = useLocationCatalog();
const canOperator = computed(() => can('operator'));
const isAdmin = computed(() => can('admin'));
const canBulkOperation = computed(() => canPerm('bulk_operation'));
const canQrExport = computed(() => canCapability('qr.export'));
const canQrReset = computed(() => canCapability('qr.reset'));
const router = useRouter();
const isMobile = ref(typeof window !== 'undefined' ? isLedgerMobileViewport() : false);
const systemSettings = ref(getCachedSystemSettings());
const archiveReasonOptions = computed(() => systemSettings.value.asset_archive_reason_options || []);
const monitorBrandOptions = computed(() => systemSettings.value.dictionary_monitor_brand_options || []);
const { runSaveAction } = useAssetFormActions();
const { runWhenBrowserIdle, scheduleDeferredTask } = useBrowserIdleTask();
const { qrExportProgress, startQrExportProgress, updateQrExportProgress, finishQrExportProgress } = useQrExportProgress();
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
  defaultViewName,
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
  setDefaultSavedView,
  getDefaultSavedView,
  runWithoutAutoSearch,
} = useMonitorAssetViewState(() => {
  void refreshLedgerData();
});


onMounted(() => {
  void initMonitorBrandOptions();
});


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
  const deletingDefault = defaultViewName.value === String(name || '').trim();
  if (!deleteSavedView(name)) return ElMessage.warning('视图不存在或已删除');
  if (deletingDefault) {
    notifyAction('视图已删除', `已删除“${name}”视图，默认已回退到系统默认视图。`, 'warning');
    return;
  }
  notifyAction('视图已删除', `已删除“${name}”视图。`, 'warning');
}

function handleSetDefaultView(name: string) {
  if (!setDefaultSavedView(name)) return ElMessage.warning('视图不存在或已删除');
  notifyAction('默认视图已更新', `“${name}” 已设置为默认视图。`, 'info');
}

let excelUtilsPromise: Promise<typeof import('../utils/excel')> | null = null;
let qrCardUtilsPromise: Promise<typeof import('../utils/qrCards')> | null = null;

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
  const filename = `${String(active.name || '显示器盘点').replace(/[/:*?"<>|]/g, '_')}_${buildBatchExportTimestamp()}_盘点结果.xlsx`;
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
let initialHydrationDone = false;

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

const {
  dlgAsset,
  assetSaving,
  lazyAssetDialog,
  openCreate,
  openEdit,
  closeAssetDialog,
  saveAsset,
} = useMonitorAssetForm({
  ensureLocationOptionsReady,
  monitorBrandOptions,
  refreshMonitorBrandOptions,
  handleMaybeMissingSchema,
  systemSettings,
  refreshCurrent,
  patchCurrentRows,
  findLocationParts,
  ensureLocalPatchedPageStable,
});

function applyMonitorStatusPatch(ids: number[], nextStatus: string) {
  ids.forEach((id) => invalidateAssetHistoryCache('monitor', id));
  patchCurrentRows(ids, (row) => ({ ...row, status: nextStatus }));
}

function applyMonitorLocationPatch(ids: number[], nextLocationId: number | '') {
  const normalizedId = Number(nextLocationId || 0) || null;
  const parts = normalizedId ? findLocationParts(normalizedId) : { location_name: '', parent_location_name: '' };
  patchCurrentRows(ids, (row) => ({ ...row, location_id: normalizedId, ...parts }));
}

function applyMonitorOwnerPatch(ids: number[], payload: { employee_name?: string; employee_no?: string; department?: string; clearOwner?: boolean }) {
  const nextDepartment = String(payload.department || '').trim();
  ids.forEach((id) => invalidateAssetHistoryCache('monitor', id));
  patchCurrentRows(ids, (row) => ({
    ...row,
    employee_name: payload.employee_name || '',
    employee_no: payload.employee_no || '',
    department: payload.clearOwner ? '' : (nextDepartment || row.department || ''),
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
    const nextDept = String(batchOwnerForm.value.department || '').trim();
    return name === String(batchOwnerForm.value.employee_name || '').trim()
      && no === String(batchOwnerForm.value.employee_no || '').trim()
      && (!nextDept || dept === nextDept);
  }).length;
  return { total, archived, sameOwner, eligible: Math.max(0, total - archived - sameOwner) };
});

const batchArchivePreview = computed(() => {
  const total = selectedRows.value.length;
  const archived = selectedRows.value.filter((row) => Number(row.archived || 0) === 1).length;
  return { total, archived, eligible: Math.max(0, total - archived) };
});

const { selectedIds, selectedRows, selectedCount, syncPageSelection, clearSelection } = useCrossPageSelection<MonitorAsset>((row) => String(row.id));
const { selectionSummary, selectedNumberIds } = useAssetSelectionSummary(selectedRows);
const { confirmBatchRisk, runBulkAction, runBulkDelete } = useAssetBulkActions({
  endpoint: '/api/monitor-assets-bulk',
  assetLabel: '显示器',
  selectedCount,
  selectedNumberIds,
  archivedCount: computed(() => selectionSummary.value.archived),
  batchBusy,
  clearSelection,
  ensureLocalPatchedPageStable,
  loadExcelUtils,
});
const opSubmitting = ref(false);
const locationSaving = ref(false);

bindPersistence(pageSize);

function buildInventorySummaryFilters(filters: MonitorFilters = currentFiltersForList()): MonitorFilters {
  return { ...filters, inventoryStatus: '' };
}

const {
  shouldLoadInventorySummary,
  scheduleAuxiliaryRefresh,
  runWithDeferredInventoryBatchRefresh,
} = useAssetLedgerBatchRefresh({
  assetType: 'monitor',
  batchRefreshDelayMs: 4500,
  idleTimeout: 2500,
  hasActiveInventoryBatch,
  inventoryStatus,
  inventoryBatch,
  inventoryBatchLoadedAt,
  inventorySummary,
  refreshInventoryBatchStore,
  refreshInventorySummary: async (filters?: any) => {
    const f = filters || currentFiltersForList();
    if (!shouldLoadInventorySummary(f)) return;
    if (hasActiveInventoryBatch.value) invalidateAssetInventorySummaryCache('monitor');
    return await getMonitorAssetInventorySummary(buildInventorySummaryFilters(f), undefined, { force: hasActiveInventoryBatch.value });
  },
  currentFiltersForList,
  runWithoutAutoSearch,
  invalidateAssetInventorySummaryCache,
});

async function refreshLedgerData(options: { keepPage?: boolean; silent?: boolean; skipAuxiliary?: boolean } = {}) {
  clearKeywordTimer();
  const filters = currentFiltersForList();
  if (options.keepPage) {
    await load(filters, { keepPage: true, silent: options.silent });
  } else {
    await reload(filters, { silent: options.silent });
  }
  lastRefreshAt = Date.now();
  if (!options.skipAuxiliary) scheduleAuxiliaryRefresh(filters);
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
    const result: any = await withBlockingActionFeedback('正在恢复显示器归档', () =>
      apiPost('/api/monitor-assets-bulk', { action: 'restore', ids: [Number(row.id)] })
    );
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
  await runBulkAction({
    action: 'status',
    payload: { status: batchStatusValue.value },
    successMessage: '批量状态已更新',
    notificationTitle: '显示器状态已更新',
    notificationMessage: `已处理 ${selectedCount.value} 台显示器的状态`,
    errorMessage: '批量更新状态失败',
    closeDialog: () => { batchStatusVisible.value = false; },
    applyResult: (result) => applyMonitorStatusPatch(extractAffectedIds(result), batchStatusValue.value),
  });
}

async function submitBatchLocation() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  if (!batchLocationValue.value) return ElMessage.warning('请选择位置');
  await runBulkAction({
    action: 'location',
    payload: { location_id: batchLocationValue.value },
    successMessage: '批量位置已更新',
    notificationTitle: '显示器位置已更新',
    notificationMessage: `已处理 ${selectedCount.value} 台显示器的位置`,
    errorMessage: '批量更新位置失败',
    closeDialog: () => { batchLocationVisible.value = false; },
    applyResult: (result) => applyMonitorLocationPatch(extractAffectedIds(result), batchLocationValue.value),
  });
}

async function submitBatchOwner() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  if (!String(batchOwnerForm.value.employee_name || '').trim()) return ElMessage.warning('请填写领用人');
  await runBulkAction({
    action: 'owner',
    payload: {
      employee_name: batchOwnerForm.value.employee_name,
      employee_no: batchOwnerForm.value.employee_no,
      department: batchOwnerForm.value.department,
    },
    successMessage: '批量领用人已更新',
    notificationTitle: '显示器领用人已更新',
    notificationMessage: `已处理 ${selectedCount.value} 台显示器的领用信息`,
    errorMessage: '批量更新领用人失败',
    closeDialog: () => { batchOwnerVisible.value = false; },
    applyResult: (result) => applyMonitorOwnerPatch(extractAffectedIds(result), batchOwnerForm.value),
  });
}

async function batchRestoreSelected() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  const restorable = selectionSummary.value.archived;
  if (!restorable) return ElMessage.warning('选中显示器中没有可恢复的归档记录');
  try {
    await confirmBatchRisk('批量恢复', `将恢复 ${restorable} 台已归档显示器，恢复后会重新出现在默认台账列表中。`);
  } catch {
    return;
  }
  await runBulkAction({
    action: 'restore',
    requestLabel: '正在批量恢复显示器归档',
    successMessage: '批量恢复成功',
    notificationTitle: '显示器已恢复',
    notificationMessage: `已处理 ${selectedCount.value} 台显示器`,
    notificationType: 'info',
    errorMessage: '批量恢复失败',
    stable: true,
    applyResult: (result) => applyMonitorRestorePatch(extractAffectedIds(result)),
  });
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
    await confirmBatchRisk('批量归档', `将归档选中的 ${selectedCount.value} 台显示器，归档后默认列表不再显示。`);
  } catch {
    return;
  }
  await runBulkAction({
    action: 'archive',
    payload: {
      reason: batchArchiveForm.value.reason,
      note: batchArchiveForm.value.note,
    },
    successMessage: '批量归档成功',
    notificationTitle: '显示器已归档',
    notificationMessage: `已处理 ${selectedCount.value} 台显示器`,
    notificationType: 'warning',
    errorMessage: '批量归档失败',
    closeDialog: () => { batchArchiveVisible.value = false; },
    stable: true,
    applyResult: (result) => applyMonitorArchivePatch(extractAffectedIds(result), batchArchiveForm.value),
  });
}

async function batchDeleteSelected() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  await runBulkDelete({
    requestLabel: '显示器批量删除',
    errorMessage: '批量删除失败',
    applyDeletePatch: applyMonitorDeletePatch,
  });
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

function openInfo(row: MonitorAsset) {
  infoRow.value = { ...row };
  warmLazyDialog(lazyInfoDialog);
  infoVisible.value = true;
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
  if (!asset) return;
  const operationText: Record<typeof dlgOp.kind, string> = {
    in: '入库',
    out: '出库',
    return: '归还',
    transfer: '调拨',
  };
  await runSaveAction<{
    asset: MonitorAsset;
    kind: typeof dlgOp.kind;
    form: typeof dlgOp.form;
  }>({
    busy: opSubmitting,
    buildPayload: () => ({
      asset,
      kind: dlgOp.kind,
      form: {
        location_id: dlgOp.form.location_id || '',
        employee_no: trimText(dlgOp.form.employee_no),
        employee_name: trimText(dlgOp.form.employee_name),
        department: trimText(dlgOp.form.department),
        remark: trimText(dlgOp.form.remark),
      },
    }),
    submit: ({ asset, kind, form }) => {
      if (kind === 'in') {
        return apiPost('/api/monitor-in', { asset_id: asset.id, location_id: form.location_id || null, remark: form.remark });
      }
      if (kind === 'out') {
        return apiPost('/api/monitor-out', {
          asset_id: asset.id,
          location_id: form.location_id || null,
          employee_no: form.employee_no,
          employee_name: form.employee_name,
          department: form.department,
          remark: form.remark,
        });
      }
      if (kind === 'return') {
        return apiPost('/api/monitor-return', { asset_id: asset.id, location_id: form.location_id || null, remark: form.remark });
      }
      return apiPost('/api/monitor-transfer', { asset_id: asset.id, to_location_id: form.location_id, remark: form.remark });
    },
    successMessage: `${operationText[dlgOp.kind]}成功`,
    notificationTitle: `显示器${operationText[dlgOp.kind]}成功`,
    notificationMessage: ({ asset, kind }) => `${asset.asset_code || asset.sn || '显示器'} 已完成${operationText[kind]}。`,
    errorMessage: '操作失败',
    onSuccess: async ({ asset, kind, form }) => {
      dlgOp.show = false;
      if (systemSettings.value.ui_write_local_refresh) {
        const assetId = Number(asset.id);
        if (kind === 'in') {
          applyMonitorStatusPatch([assetId], 'IN_STOCK');
          applyMonitorLocationPatch([assetId], form.location_id || '');
          applyMonitorOwnerPatch([assetId], { employee_name: '', employee_no: '', department: '', clearOwner: true });
        } else if (kind === 'out') {
          applyMonitorStatusPatch([assetId], 'ASSIGNED');
          applyMonitorLocationPatch([assetId], form.location_id || '');
          applyMonitorOwnerPatch([assetId], { employee_name: form.employee_name, employee_no: form.employee_no, department: form.department });
        } else if (kind === 'return') {
          applyMonitorStatusPatch([assetId], 'IN_STOCK');
          applyMonitorLocationPatch([assetId], form.location_id || '');
          applyMonitorOwnerPatch([assetId], { employee_name: '', employee_no: '', department: '', clearOwner: true });
        } else if (kind === 'transfer') {
          applyMonitorLocationPatch([assetId], form.location_id || '');
        }
        await ensureLocalPatchedPageStable(false);
      } else {
        await refreshCurrent(true, true);
      }
    },
  });
}

const {
  visible: qrVisible,
  loading: qrLoading,
  dataUrl: qrDataUrl,
  link: qrLink,
  row: qrRow,
  openQr: openAssetQr,
  resetQr,
  copyLink: copyQrLink,
  openLink: openQrInNewTab,
  qrTemplateVisible,
  qrTemplateKind,
  submitQrPrintTemplate,
  exportSelectedQrLinks,
  exportSelectedQrCards,
  exportSelectedQrPng,
  downloadQr,
  downloadLabel,
} = useMonitorAssetQr({
  canExport: canQrExport,
  canReset: canQrReset,
  selectedRows,
  selectedCount,
  exportBusy,
  batchBusy,
  locationText,
  loadExcelUtils,
  loadQrCardUtils,
  startProgress: startQrExportProgress,
  updateProgress: updateQrExportProgress,
  finishProgress: finishQrExportProgress,
});

function openAuditHistory(row?: MonitorAsset | null) {
  const id = Number(row?.id || infoRow.value?.id || 0);
  if (!id) return;
  infoVisible.value = false;
  router.push({ path: '/system/audit', query: { entity: 'monitor_assets', entity_id: String(id), module: 'MONITOR' } });
}

async function openQr(row: MonitorAsset) {
  warmLazyDialog(lazyQrDialog);
  await openAssetQr(row);
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








async function hydrateViewData(options: { keepPage?: boolean; silent?: boolean; skipAuxiliary?: boolean } = {}) {
  await runWithDeferredInventoryBatchRefresh(() => refreshLedgerData(options));
}

function handleViewportResize() {
  isMobile.value = typeof window !== 'undefined' ? isLedgerMobileViewport() : false;
}

onBeforeMount(() => {
  const defaultView = getDefaultSavedView();
  if (defaultView) {
    runWithoutAutoSearch(() => {
      applySavedView(defaultView.name);
    });
  }
  handleViewportResize();
  if (typeof window !== 'undefined') window.addEventListener('resize', handleViewportResize, { passive: true });
  void hydrateViewData({ skipAuxiliary: true }).finally(() => {
    initialHydrationDone = true;
    const filters = currentFiltersForList();
    scheduleAuxiliaryRefresh(filters);
  });
});

onMounted(() => {
  if (locationId.value) {
    void ensureLocationOptionsReady();
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleViewportResize);
  }
  cleanupViewState();
});

onActivated(() => {
  if (!initialHydrationDone) return;
  if (Date.now() - lastRefreshAt < SOFT_REFRESH_TTL_MS) return;
  void hydrateViewData({ keepPage: true, silent: true });
});
</script>

<style scoped>
.ledger-page {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ledger-page-heading {
  position: relative;
  z-index: 1;
}

.ledger-page-heading__meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.ledger-section {
  position: relative;
  z-index: 1;
}

:deep(.ledger-toolbar-card),
:deep(.ledger-table-card) {
  position: relative;
  border: 1px solid #d8dee9;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
}

:deep(.ledger-toolbar-card > .el-card__body),
:deep(.ledger-table-card > .el-card__body) {
  padding: 18px;
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
    gap: 12px;
  }

  .ledger-page-heading__meta {
    justify-content: flex-start;
  }

  :deep(.ledger-toolbar-card > .el-card__body),
  :deep(.ledger-table-card > .el-card__body) {
    padding: 14px;
  }
}
</style>
