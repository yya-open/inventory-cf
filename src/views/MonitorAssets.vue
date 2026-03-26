<template>
  <div>
    <MonitorAssetsToolbar
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
      :inventory-batch="inventoryBatch"
      :has-active-batch="hasActiveInventoryBatch"
      @update:visible-columns="updateVisibleColumns"
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
      @restore-columns="restoreDefaultColumns"
      @download-template="downloadMonitorTemplate"
      @start-batch="openStartBatch"
      @close-batch="closeActiveBatch"
      @import-file="onImportMonitorFile"
      @open-create="openCreate"
      @toolbar-more="handleToolbarMore"
      @ensure-location-options="ensureLocationOptionsReady"
    />

    <MonitorAssetsTable
      :rows="rows"
      :loading="loading"
      :total="total"
      :page="page"
      :page-size="pageSize"
      :can-operator="canOperator"
      :is-admin="isAdmin"
      :status-text="assetStatusText"
      :location-text="locationText"
      :visible-columns="visibleColumns"
      :column-widths="columnWidths"
      :selected-ids="selectedIds"
      :show-inventory-column="hasActiveInventoryBatch"
      :enable-inventory-highlight="hasActiveInventoryBatch"
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
    />


    <MonitorAssetFormDialog
      v-if="lazyAssetDialog"
      v-model:visible="dlgAsset.show"
      :mode="dlgAsset.mode"
      :form="dlgAsset.form"
      :location-options="locationOptions"
      :saving="assetSaving"
      :brand-options="monitorBrandOptions"
      @save="saveAsset"
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
      :status-text="assetStatusText"
      @download="downloadQr"
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
      :department-options="departmentOptions"
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
      kind-label="显示器"
      @submit="submitQrPrintTemplate"
    />

  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, onActivated, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import { getMonitorAssetInventorySummary, listMonitorAssets } from '../api/assetLedgers';
import { closeInventoryBatch, fetchInventoryBatch, startInventoryBatch, type InventoryBatchPayload } from '../api/inventoryBatches';
import { fetchBulkMonitorAssetQrLinks } from '../api/assetQr';
import { createAssetQrExportJob, exportAssetQrLinksWorkbook, exportAssetQrPrintLocal, formatAssetQrJobCreatedMessage } from '../utils/assetQrExport';
import { getCachedAssetQr, invalidateAssetQr, setCachedAssetQr } from '../utils/assetQrCache';
import { useAssetLedgerPage } from '../composables/useAssetLedgerPage';
import { useCrossPageSelection } from '../composables/useCrossPageSelection';
import { can } from '../store/auth';
import type { AssetInventorySummary, LocationRow, MonitorAsset, MonitorFilters } from '../types/assets';
import { assetStatusText, inventoryIssueTypeText, inventoryStatusText } from '../types/assets';
import { formatBeijingDateTime } from '../utils/datetime';
import { getCachedSystemSettings } from '../api/systemSettings';
import MonitorAssetsToolbar from '../components/assets/MonitorAssetsToolbar.vue';
import MonitorAssetsTable from '../components/assets/MonitorAssetsTable.vue';
import QrPrintTemplateDialog from '../components/assets/QrPrintTemplateDialog.vue';
import type { QrPrintTemplate, QrPrintTemplateKind } from '../utils/qrPrintTemplate';
import { useLocationCatalog } from '../composables/useLocationCatalog';
import { useMonitorAssetViewState } from './assets/monitorAssetViewState';
import { createAssetPagePatchController, applyGenericArchivePatch, applyGenericDeletePatch, applyGenericRestorePatch } from './assets/assetLocalPatch';
import { buildBulkDeleteConfirmTip, extractAffectedIds, summarizeBulkDeleteResult } from './assets/assetBulkActions';
import { exportInventoryLogsBeforeBatch } from '../utils/inventoryBatchExport';

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
const router = useRouter();
const systemSettings = ref(getCachedSystemSettings());
const archiveReasonOptions = computed(() => systemSettings.value.asset_archive_reason_options || []);
const departmentOptions = computed(() => systemSettings.value.dictionary_department_options || []);
const monitorBrandOptions = computed(() => systemSettings.value.dictionary_monitor_brand_options || []);
const qrTemplateVisible = ref(false);
const qrTemplateKind = ref<QrPrintTemplateKind>('cards');
const inventorySummary = ref<AssetInventorySummary>({ unchecked: 0, checked_ok: 0, checked_issue: 0, total: 0 });
const inventoryBatch = ref<InventoryBatchPayload>({ active: null, latest: null, recent: [] });
const hasActiveInventoryBatch = computed(() => Boolean(inventoryBatch.value.active?.id));
const displayedMonitorColumnOptions = computed(() => hasActiveInventoryBatch.value ? monitorColumnOptions : monitorColumnOptions.filter((item) => item.value !== 'inventory'));
const displayedMonitorVisibleColumns = computed(() => hasActiveInventoryBatch.value ? visibleColumns.value : visibleColumns.value.filter((item) => item !== 'inventory'));

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
  runWithoutAutoSearch,
} = useMonitorAssetViewState(() => {
  const filters = currentFiltersForList();
  void refreshInventorySummary(filters);
  reload(filters);
});

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

const { rows, loading, page, pageSize, total, load, reload, onPageChange, onPageSizeChange, fetchAll, invalidateTotal } = useAssetLedgerPage<MonitorFilters, MonitorAsset>({
  createFilterKey: (filters) => `status=${filters.status}&location=${filters.locationId}&inventory=${filters.inventoryStatus || ''}&keyword=${filters.keyword}&archive=${filters.archiveReason || ''}&archived=${filters.showArchived ? 1 : 0}&archiveMode=${filters.archiveMode}`,
  fetchPage: async (filters, currentPage, currentPageSize, _fast, signal) => {
    try {
      return await listMonitorAssets(filters, currentPage, currentPageSize, false, signal);
    } catch (error: any) {
      await handleMaybeMissingSchema(error);
      return await listMonitorAssets(filters, currentPage, currentPageSize, false, signal);
    }
  },
});

pageSize.value = initialPageSize;
const SOFT_REFRESH_TTL_MS = 15_000;
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
const batchArchiveForm = ref({ reason: '停用归档', note: '' });

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

async function refreshInventoryBatch() {
  try {
    inventoryBatch.value = await fetchInventoryBatch('monitor');
    if (!inventoryBatch.value.active && inventoryStatus.value) {
      runWithoutAutoSearch(() => {
        inventoryStatus.value = '';
      });
    }
  } catch {
    inventoryBatch.value = { active: null, latest: inventoryBatch.value.latest || null, recent: inventoryBatch.value.recent || [] };
  }
}

async function refreshInventorySummary(filters: MonitorFilters = currentFiltersForList()) {
  try {
    inventorySummary.value = await getMonitorAssetInventorySummary(buildInventorySummaryFilters(filters));
  } catch (error) {
    console.warn('monitor inventory summary failed', error);
  }
}

const reloadList = () => {
  clearKeywordTimer();
  const filters = currentFiltersForList();
  void refreshInventorySummary(filters);
  void refreshInventoryBatch();
  reload(filters);
};

function handleToolbarMore(command: string) {
  if (command === 'location') return openLocationMgr();
  if (command === 'initQr') return initQrKeys();
}

function handleRowMore(command: string, row: MonitorAsset) {
  if (command === 'edit') return openEdit(row);
  if (command === 'qr') return openQr(row);
  if (command === 'audit') return openAuditHistory(row);
  if (command === 'return') return openReturn(row);
  if (command === 'transfer') return openTransfer(row);
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
    if (!isAdmin.value) {
      await exportSelectedQrCardsLocal(template);
      return;
    }
    const result = await createAssetQrExportJob({
      rows: selectedRows.value,
      getId: (row) => Number(row.id),
      jobType: 'MONITOR_QR_CARDS_EXPORT',
      template,
    });
    ElMessage.success(formatAssetQrJobCreatedMessage(result, '二维码卡片打印页'));
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码卡片失败');
  } finally {
    exportBusy.value = false;
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
  batchArchiveForm.value = { reason: archiveReasonOptions.value[0] || '停用归档', note: '' };
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
    const result: any = await apiPost('/api/monitor-assets-bulk', {
      action: 'delete',
      ids: selectedIds.value.map((id) => Number(id)),
    });
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

async function openCreate() {
  await ensureLocationOptionsReady();
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
  assetSaving.value = true;
  try {
    if (dlgAsset.mode === 'create') {
      await apiPost('/api/monitor-assets', dlgAsset.form);
      ElMessage.success('新增成功');
    } else {
      await apiPut('/api/monitor-assets', dlgAsset.form);
      ElMessage.success('保存成功');
    }
    dlgAsset.show = false;
    await refreshCurrent(true, true);
  } catch (error: any) {
    try {
      await handleMaybeMissingSchema(error);
      if (dlgAsset.mode === 'create') {
        await apiPost('/api/monitor-assets', dlgAsset.form);
        ElMessage.success('新增成功');
      } else {
        await apiPut('/api/monitor-assets', dlgAsset.form);
        ElMessage.success('保存成功');
      }
      dlgAsset.show = false;
      await refreshCurrent(true, true);
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
    const result: any = await apiPost('/api/monitor-assets-bulk', { action: 'delete', ids: [Number(row.id)] });
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
    await refreshCurrent(true, true);
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


async function exportSelectedQrSheetLocal(template?: Partial<QrPrintTemplate>) {
  const result = await exportAssetQrPrintLocal({
    mode: 'sheet',
    rows: selectedRows.value,
    getId: (row) => Number(row.id),
    fetchBulkLinks: fetchBulkMonitorAssetQrLinks,
    mapPrintRecord: (row, url) => {
      if (!url) return null;
      return {
        title: row.asset_code || `显示器 #${row.id}`,
        subtitle: [row.brand, row.model].filter(Boolean).join(' · ') || `SN：${row.sn || '-'}`,
        meta: [
          { label: '状态', value: assetStatusText(row.status) },
          { label: '位置', value: locationText(row) },
          { label: '领用人', value: row.employee_name || '-' },
          { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
        ],
        url,
      };
    },
    loadQrCardUtils,
    filename: `显示器二维码图版_${selectedRows.value.length}条`,
    title: '显示器二维码图版',
    template,
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
    mapPrintRecord: (row, url) => {
      if (!url) return null;
      return {
        title: `${row.asset_code || '-'} ${row.brand || ''}`.trim(),
        subtitle: `${row.model || '-'} · SN：${row.sn || '-'}`,
        meta: [
          { label: '状态', value: assetStatusText(row.status) },
          { label: '位置', value: locationText(row) },
          { label: '领用人', value: row.employee_name || '-' },
        ],
        url,
      };
    },
    loadQrCardUtils,
    filename: `显示器二维码卡片_${selectedRows.value.length}条`,
    title: '显示器二维码卡片',
    template,
  });
  if (result.empty) return ElMessage.warning('当前选中项没有可导出的二维码');
  ElMessage.success('二维码卡片已导出，可直接打印');
}

function openQrPrintTemplate(kind: QrPrintTemplateKind) {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  qrTemplateKind.value = kind;
  qrTemplateVisible.value = true;
}

async function submitQrPrintTemplate(template: QrPrintTemplate) {
  if (qrTemplateKind.value === 'cards') {
    await executeExportSelectedQrCards(template);
    return;
  }
  await executeExportSelectedQrSheet(template);
}

async function executeExportSelectedQrSheet(template?: Partial<QrPrintTemplate>) {
  try {
    exportBusy.value = true;
    if (!isAdmin.value) {
      await exportSelectedQrSheetLocal(template);
      return;
    }
    const result = await createAssetQrExportJob({
      rows: selectedRows.value,
      getId: (row) => Number(row.id),
      jobType: 'MONITOR_QR_SHEET_EXPORT',
      template,
    });
    ElMessage.success(formatAssetQrJobCreatedMessage(result, '二维码图版打印页'));
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
  if (!qrDataUrl.value) return;
  const link = document.createElement('a');
  if (qrSvgMarkup.value) {
    const blob = new Blob([qrSvgMarkup.value], { type: 'image/svg+xml;charset=utf-8' });
    link.href = URL.createObjectURL(blob);
    link.download = `显示器二维码_${qrRow.value?.asset_code || 'monitor'}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    return;
  }
  link.href = qrDataUrl.value;
  link.download = `显示器二维码_${qrRow.value?.asset_code || 'monitor'}.svg`;
  link.click();
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
  reloadList();
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

async function openStartBatch() {
  try {
    const defaultName = `显示器盘点 ${new Date().toISOString().slice(0, 10)}`;
    const { value } = await ElMessageBox.prompt('请输入本轮显示器盘点名称。开启后会自动导出并清空显示器盘点记录页中的现有记录，同时将台账盘点状态整体重置为“未盘”。', '开启新一轮盘点', {
      confirmButtonText: '开启',
      cancelButtonText: '取消',
      inputValue: defaultName,
      inputPattern: /.+/,
      inputErrorMessage: '请输入批次名称',
    });
    batchBusy.value = true;
    await exportInventoryLogsBeforeBatch('monitor');
    const result: any = await startInventoryBatch('monitor', String(value || defaultName), { clearPreviousLogs: true });
    const cleared = Number(result?.cleanup?.deleted || 0);
    const successMessage = cleared > 0
      ? `已自动导出并清空 ${cleared} 条显示器盘点记录，${result?.message || '已开启新一轮盘点'}`
      : (result?.message || '已开启新一轮盘点');
    ElMessage.success(successMessage);
    await Promise.all([refreshInventoryBatch(), refreshInventorySummary(currentFiltersForList()), refreshCurrent(true, true)]);
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || '开启盘点批次失败');
  } finally {
    batchBusy.value = false;
  }
}

async function closeActiveBatch() {
  const active = inventoryBatch.value.active;
  if (!active?.id) return ElMessage.warning('当前没有进行中的显示器盘点批次');
  try {
    await ElMessageBox.confirm(`确认结束本轮显示器盘点：${active.name}？结束时会自动导出“已盘 / 未盘 / 异常”Excel结果表，方便你直接复核。`, '结束盘点批次', {
      type: 'warning',
      confirmButtonText: '结束本轮',
      cancelButtonText: '取消',
    });
    batchBusy.value = true;
    const exported = await exportMonitorBatchClosingWorkbook(active);
    const result: any = await closeInventoryBatch('monitor', active.id);
    ElMessage.success(`${result?.message || '本轮盘点已结束'}，结果表已导出（已盘 ${exported.checked} / 未盘 ${exported.unchecked} / 异常 ${exported.issue}）`);
    await refreshInventoryBatch();
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || '结束盘点批次失败');
  } finally {
    batchBusy.value = false;
  }
}

onMounted(async () => {
  await refreshInventoryBatch();
  const filters = currentFiltersForList();
  await Promise.all([load(filters), refreshInventorySummary(filters)]);
  lastRefreshAt = Date.now();
  if (locationId.value) {
    void ensureLocationOptionsReady();
  }
});

onBeforeUnmount(() => {
  cleanupViewState();
});

onActivated(() => {
  if (Date.now() - lastRefreshAt < SOFT_REFRESH_TTL_MS) return;
  lastRefreshAt = Date.now();
  void refreshInventoryBatch().then(() => {
    const filters = currentFiltersForList();
    void load(filters, { keepPage: true });
    void refreshInventorySummary(filters);
  });
});
</script>

<style scoped>
.batch-preview {
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  margin-top:6px;
}

.batch-help {
  color: #909399;
  font-size: 12px;
  padding-left: 4px;
}
</style>
