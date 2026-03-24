<template>
  <div>
    <MonitorAssetsToolbar
      v-model:status="status"
      v-model:location-id="locationId"
      v-model:keyword="keyword"
      v-model:archive-reason="archiveReason"
      v-model:archive-mode="archiveMode"
      v-model:show-archived="showArchived"
      :location-options="locationOptions"
      :can-operator="canOperator"
      :is-admin="isAdmin"
      :visible-columns="visibleColumns"
      :column-order="columnOrder"
      :column-options="monitorColumnOptions"
      :selected-count="selectedCount"
      :export-busy="exportBusy"
      :import-busy="importBusy"
      :init-qr-busy="initQrBusy"
      :batch-busy="batchBusy"
      :archive-reason-options="archiveReasonOptions"
      @update:visible-columns="updateVisibleColumns"
      @move-column="moveVisibleColumn"
      @search="reloadList"
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
      @open-info="openInfo"
      @in="openIn"
      @out="openOut"
      @row-more="handleRowMore"
      @remove="removeAsset"
      @restore="restoreAsset"
      @selection-change="onSelectionChange"
      @column-resize="updateColumnWidth"
      @page-change="(value) => onPageChange(currentFilters(), value)"
      @size-change="(value) => onPageSizeChange(currentFilters(), value)"
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
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, onActivated, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import { listMonitorAssets } from '../api/assetLedgers';
import { fetchBulkMonitorAssetQrLinks } from '../api/assetQr';
import { getCachedAssetQr, invalidateAssetQr, setCachedAssetQr } from '../utils/assetQrCache';
import { useAssetLedgerPage } from '../composables/useAssetLedgerPage';
import { useCrossPageSelection } from '../composables/useCrossPageSelection';
import { can } from '../store/auth';
import type { LocationRow, MonitorAsset, MonitorFilters } from '../types/assets';
import { assetStatusText } from '../types/assets';
import { formatBeijingDateTime } from '../utils/datetime';
import { readJsonStorage, writeJsonStorage } from '../utils/storage';
import { getCachedSystemSettings } from '../api/systemSettings';
import { moveColumnKey, normalizeColumnOrder, normalizeColumnWidths, normalizeVisibleColumns, orderVisibleColumns, setColumnWidth } from '../utils/tableColumns';
import { createIdleDebounced } from '../utils/idleDebounce';
import MonitorAssetsToolbar from '../components/assets/MonitorAssetsToolbar.vue';
import MonitorAssetsTable from '../components/assets/MonitorAssetsTable.vue';
import QrPrintTemplateDialog from '../components/assets/QrPrintTemplateDialog.vue';
import type { QrPrintTemplate, QrPrintTemplateKind } from '../utils/qrPrintTemplate';
import { useLocationCatalog } from '../composables/useLocationCatalog';

const MonitorAssetFormDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetFormDialog.vue'));
const MonitorAssetInfoDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetInfoDialog.vue'));
const MonitorAssetOperationDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetOperationDialog.vue'));
const MonitorAssetQrDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetQrDialog.vue'));
const MonitorLocationManagerDialog = defineAsyncComponent(() => import('../components/assets/MonitorLocationManagerDialog.vue'));
const MonitorAssetBatchStatusDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetBatchStatusDialog.vue'));
const MonitorAssetBatchLocationDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetBatchLocationDialog.vue'));
const MonitorAssetBatchOwnerDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetBatchOwnerDialog.vue'));
const MonitorAssetBatchArchiveDialog = defineAsyncComponent(() => import('../components/assets/MonitorAssetBatchArchiveDialog.vue'));

const STORAGE_KEY = 'inventory:monitor-assets:filters';
const MONITOR_COLUMN_OPTIONS = [
  { value: 'assetCode', label: '资产编号' },
  { value: 'sn', label: 'SN' },
  { value: 'model', label: '型号' },
  { value: 'size', label: '尺寸' },
  { value: 'status', label: '状态' },
  { value: 'location', label: '位置' },
  { value: 'owner', label: '领用人' },
  { value: 'department', label: '部门' },
  { value: 'updatedAt', label: '更新时间' },
] as const;
const MONITOR_COLUMN_KEYS = MONITOR_COLUMN_OPTIONS.map((item) => item.value);
const persistedState = readJsonStorage(STORAGE_KEY, { status: '', locationId: '', keyword: '', archiveReason: '', archiveMode: 'active', showArchived: false, pageSize: getCachedSystemSettings().ui_default_page_size, visibleColumns: MONITOR_COLUMN_KEYS, columnOrder: MONITOR_COLUMN_KEYS, columnWidths: {} as Record<string, number> });

const status = ref(String(persistedState.status || ''));
const locationId = ref(String(persistedState.locationId || ''));
const keyword = ref(String(persistedState.keyword || ''));
const archiveReason = ref(String((persistedState as any).archiveReason || ''));
const archiveMode = ref(((persistedState as any).archiveMode || (persistedState.showArchived ? 'all' : 'active')) as 'active' | 'archived' | 'all');
const showArchived = ref(Boolean(persistedState.showArchived || archiveMode.value !== 'active'));
const columnOrder = ref(normalizeColumnOrder(persistedState.columnOrder, MONITOR_COLUMN_KEYS));
const visibleColumns = ref(orderVisibleColumns(normalizeVisibleColumns(persistedState.visibleColumns, MONITOR_COLUMN_KEYS), columnOrder.value));
const columnWidths = ref(normalizeColumnWidths(persistedState.columnWidths, MONITOR_COLUMN_KEYS));
const { enabledLocations: locations, ensureEnabledLocations, ensureAllLocations, resetLocationCatalog } = useLocationCatalog();
const canOperator = computed(() => can('operator'));
const isAdmin = computed(() => can('admin'));
const router = useRouter();
const systemSettings = ref(getCachedSystemSettings());
const archiveReasonOptions = computed(() => systemSettings.value.asset_archive_reason_options || []);
const departmentOptions = computed(() => systemSettings.value.dictionary_department_options || []);
const monitorBrandOptions = computed(() => systemSettings.value.dictionary_monitor_brand_options || []);
const qrTemplateVisible = ref(false);
const qrTemplateKind = ref<QrPrintTemplateKind>('cards');

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

const currentFilters = (): MonitorFilters => ({
  status: status.value || '',
  locationId: String(locationId.value || ''),
  keyword: keyword.value || '',
  archiveReason: archiveMode.value !== 'active' ? (archiveReason.value || '') : '',
  archiveMode: archiveMode.value,
  showArchived: Boolean(showArchived.value || archiveMode.value !== 'active'),
});

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
  createFilterKey: (filters) => `status=${filters.status}&location=${filters.locationId}&keyword=${filters.keyword}&archive=${filters.archiveReason || ''}&archived=${filters.showArchived ? 1 : 0}&archiveMode=${filters.archiveMode}`,
  fetchPage: async (filters, currentPage, currentPageSize, _fast, signal) => {
    try {
      return await listMonitorAssets(filters, currentPage, currentPageSize, false, signal);
    } catch (error: any) {
      await handleMaybeMissingSchema(error);
      return await listMonitorAssets(filters, currentPage, currentPageSize, false, signal);
    }
  },
});

pageSize.value = Number(persistedState.pageSize || pageSize.value || getCachedSystemSettings().ui_default_page_size || 50);
const SOFT_REFRESH_TTL_MS = 15_000;
let lastRefreshAt = 0;


async function refreshCurrent(keepPage = true, resetTotal = false) {
  if (resetTotal) invalidateTotal();
  await load(currentFilters(), { keepPage });
  lastRefreshAt = Date.now();
}

function patchCurrentRows(ids: number[], updater: (row: any) => any) {
  const idSet = new Set((ids || []).map((item) => Number(item)));
  let changed = 0;
  rows.value = rows.value.map((row: any) => {
    if (!idSet.has(Number(row.id))) return row;
    changed += 1;
    return updater({ ...row });
  });
  if (changed) lastRefreshAt = Date.now();
  return changed;
}

function removeCurrentRows(ids: number[]) {
  const idSet = new Set((ids || []).map((item) => Number(item)));
  const before = rows.value.length;
  rows.value = rows.value.filter((row: any) => !idSet.has(Number(row.id)));
  const removed = Math.max(0, before - rows.value.length);
  if (removed) {
    total.value = Math.max(0, Number(total.value || 0) - removed);
    lastRefreshAt = Date.now();
  }
  return removed;
}

async function ensureLocalPatchedPageStable(resetTotal = false) {
  if (resetTotal) invalidateTotal();
  if (!rows.value.length && page.value > 1) {
    page.value -= 1;
    await refreshCurrent(true, resetTotal);
  }
}

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
  if (archiveMode.value === 'active') {
    removeCurrentRows(ids);
    return;
  }
  patchCurrentRows(ids, (row) => ({
    ...row,
    archived: 1,
    archived_reason: payload.reason || row.archived_reason || '',
    archived_note: payload.note || row.archived_note || '',
    archived_at: row.archived_at || formatBeijingDateTime(new Date().toISOString()),
  }));
}

function applyMonitorRestorePatch(ids: number[]) {
  if (archiveMode.value === 'archived') {
    removeCurrentRows(ids);
    return;
  }
  patchCurrentRows(ids, (row) => ({
    ...row,
    archived: 0,
    archived_reason: '',
    archived_note: '',
    archived_at: '',
    archived_by: '',
  }));
}

function applyMonitorDeletePatch(successItems: Array<{ id: number; action: string; reason?: string | null }>) {
  const archivedIds = successItems.filter((item) => item.action === 'archive').map((item) => Number(item.id));
  const removedIds = successItems.filter((item) => item.action !== 'archive').map((item) => Number(item.id));
  if (archiveMode.value === 'all') {
    if (archivedIds.length) patchCurrentRows(archivedIds, (row) => ({ ...row, archived: 1, archived_reason: row.archived_reason || '删除转归档' }));
  } else if (archivedIds.length) {
    removeCurrentRows(archivedIds);
  }
  if (removedIds.length) removeCurrentRows(removedIds);
}

const monitorColumnOptions = [...MONITOR_COLUMN_OPTIONS];
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

function persistState() {
  writeJsonStorage(STORAGE_KEY, {
    status: status.value || '',
    locationId: String(locationId.value || ''),
    keyword: keyword.value || '',
    showArchived: Boolean(showArchived.value || archiveMode.value !== 'active'),
    archiveMode: archiveMode.value,
    archiveReason: archiveReason.value || '',
    pageSize: Number(pageSize.value || 50),
    visibleColumns: visibleColumns.value,
    columnOrder: columnOrder.value,
    columnWidths: columnWidths.value,
  });
}

let suppressAutoSearch = false;
let keywordTimer: ReturnType<typeof setTimeout> | null = null;

function clearKeywordTimer() {
  if (keywordTimer) {
    clearTimeout(keywordTimer);
    keywordTimer = null;
  }
}

function scheduleKeywordSearch() {
  clearKeywordTimer();
  keywordTimer = setTimeout(() => {
    reload(currentFilters());
  }, 320);
}

const schedulePersistState = createIdleDebounced(() => persistState(), 280);

watch([status, locationId, keyword, archiveReason, archiveMode, showArchived, pageSize, visibleColumns, columnOrder, columnWidths], () => schedulePersistState());
watch(keyword, (_value, oldValue) => {
  if (suppressAutoSearch || oldValue === undefined) return;
  scheduleKeywordSearch();
});
watch(archiveMode, (value) => {
  showArchived.value = value !== 'active';
  if (value === 'active') archiveReason.value = '';
});

watch(archiveReason, (_value, oldValue) => {
  if (suppressAutoSearch || oldValue === undefined) return;
  scheduleKeywordSearch();
});

function updateVisibleColumns(value: string[]) {
  visibleColumns.value = orderVisibleColumns(normalizeVisibleColumns(value, MONITOR_COLUMN_KEYS), columnOrder.value);
}

function restoreDefaultColumns() {
  columnOrder.value = [...MONITOR_COLUMN_KEYS];
  visibleColumns.value = [...MONITOR_COLUMN_KEYS];
  columnWidths.value = {};
}

function moveVisibleColumn(key: string, direction: 'up' | 'down') {
  columnOrder.value = moveColumnKey(columnOrder.value, key, direction);
  visibleColumns.value = orderVisibleColumns(visibleColumns.value, columnOrder.value);
}

function updateColumnWidth(payload: { key: string; width: number }) {
  if (!payload?.key) return;
  columnWidths.value = setColumnWidth(columnWidths.value, payload.key, payload.width);
}

const reloadList = () => {
  clearKeywordTimer();
  reload(currentFilters());
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
    applyMonitorRestorePatch((result?.affected_ids || [Number(row.id)]).map((id: any) => Number(id)));
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
    const { exportToXlsx } = await loadExcelUtils();
    const qrLinks = await fetchBulkMonitorAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
    const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
    const linkRows = [];
    for (const row of selectedRows.value) {
      linkRows.push({
        id: row.id,
        asset_code: row.asset_code,
        sn: row.sn,
        brand: row.brand,
        model: row.model,
        status: assetStatusText(row.status),
        url: qrLinkMap.get(Number(row.id)) || '',
      });
    }
    exportToXlsx({
      filename: `显示器二维码链接_${selectedCount.value}条.xlsx`,
      sheetName: '二维码链接',
      headers: [
        { key: 'id', title: 'ID' },
        { key: 'asset_code', title: '资产编号' },
        { key: 'sn', title: 'SN' },
        { key: 'brand', title: '品牌' },
        { key: 'model', title: '型号' },
        { key: 'status', title: '状态' },
        { key: 'url', title: '二维码链接' },
      ],
      rows: linkRows,
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
    const ids = selectedRows.value.map((row) => Number(row.id));
    const result: any = await apiPost('/api/jobs', { job_type: 'MONITOR_QR_CARDS_EXPORT', request_json: { ids, origin: window.location.origin, print_template: template }, retain_days: 7, max_retries: 1 });
    const jobId = Number(result?.data?.id || result?.id || 0);
    const splitCount = Number(result?.data?.split_count || result?.split_count || 0);
    ElMessage.success(splitCount > 1 ? `已自动拆分为 ${splitCount} 个异步任务，可在“系统工具 / 异步任务”下载二维码卡片打印页` : (jobId ? `任务已创建（#${jobId}），可在“系统工具 / 异步任务”下载二维码卡片打印页` : '任务已创建，可在“系统工具 / 异步任务”下载二维码卡片打印页'));
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
    applyMonitorStatusPatch((result?.affected_ids || []).map((id: any) => Number(id)), batchStatusValue.value);
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
    applyMonitorLocationPatch((result?.affected_ids || []).map((id: any) => Number(id)), batchLocationValue.value);
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
    applyMonitorOwnerPatch((result?.affected_ids || []).map((id: any) => Number(id)), batchOwnerForm.value);
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
    applyMonitorRestorePatch((result?.affected_ids || []).map((id: any) => Number(id)));
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
    applyMonitorArchivePatch((result?.affected_ids || []).map((id: any) => Number(id)), batchArchiveForm.value);
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
    const activeCount = Math.max(0, selectedCount.value - archivedCount);
    const tip = archivedCount && activeCount
      ? `选中的 ${selectedCount.value} 台显示器中，已归档的 ${archivedCount} 台会被彻底删除并清理历史记录，其余 ${activeCount} 台仍按原规则执行：有历史记录则自动归档，满足条件才物理删除。请输入“确认”继续。`
      : archivedCount
        ? `选中的 ${archivedCount} 台归档显示器会被彻底删除，并同时清理关联历史记录。请输入“确认”继续。`
        : `选中的 ${selectedCount.value} 台显示器中，有历史记录的资产会自动转归档，只有满足条件的资产会物理删除。请输入“确认”继续。`;
    await confirmBatchRisk('批量删除确认', tip);
    batchBusy.value = true;
    const result: any = await apiPost('/api/monitor-assets-bulk', {
      action: 'delete',
      ids: selectedIds.value.map((id) => Number(id)),
    });
    const processed = Number(result?.processed || 0);
    const failed = Number(result?.failed || 0);
    const archived = Number(result?.archived || 0);
    const deleted = Number(result?.deleted || 0);
    const purged = Number(result?.purged || 0);
    const failedRecords = Array.isArray(result?.failed_records) ? result.failed_records : [];
    if (processed) clearSelection();
    if (processed && !failed) ElMessage.success(archived || purged ? `已处理 ${processed} 台显示器（其中归档 ${archived} 台，彻底删除 ${purged} 台，物理删除 ${deleted} 台）` : `已删除 ${deleted} 台显示器`);
    else if (processed || failed) ElMessage.warning(`已处理 ${processed} 台，失败 ${failed} 台${archived ? `，其中归档 ${archived} 台` : ''}${purged ? `，彻底删除 ${purged} 台` : ''}${deleted ? `，物理删除 ${deleted} 台` : ''}`);
    if (Array.isArray(result?.success_items)) applyMonitorDeletePatch(result.success_items);
    if (failedRecords.length) await exportBatchFailures(`显示器批量删除失败明细_${failedRecords.length}条.xlsx`, failedRecords);
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
    const { exportToXlsx } = await loadExcelUtils();
    exportToXlsx({
      filename: `显示器台账_已选_${selectedCount.value}条.xlsx`,
      sheetName: '已选台账',
      headers: [
        { key: 'id', title: 'ID' },
        { key: 'asset_code', title: '资产编号' },
        { key: 'sn', title: 'SN' },
        { key: 'brand', title: '品牌' },
        { key: 'model', title: '型号' },
        { key: 'size_inch', title: '尺寸' },
        { key: 'status', title: '状态' },
        { key: 'location_text', title: '位置' },
        { key: 'employee_name', title: '领用人' },
        { key: 'employee_no', title: '员工工号' },
        { key: 'department', title: '部门' },
        { key: 'remark', title: '备注' },
        { key: 'updated_at', title: '更新时间' },
      ],
      rows: selectedRows.value.map((row) => ({
        ...row,
        status: assetStatusText(row.status),
        location_text: locationText(row),
      })),
    });
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
    const all = await fetchAll(currentFilters(), Number(total.value || 0) > 2000 ? 300 : 200);
    const { exportToXlsx } = await loadExcelUtils();
    exportToXlsx({
      filename: '显示器台账.xlsx',
      sheetName: '显示器台账',
      headers: [
        { key: 'id', title: 'ID' },
        { key: 'asset_code', title: '资产编号' },
        { key: 'sn', title: 'SN' },
        { key: 'brand', title: '品牌' },
        { key: 'model', title: '型号' },
        { key: 'size_inch', title: '尺寸' },
        { key: 'status', title: '状态' },
        { key: 'location_text', title: '位置' },
        { key: 'employee_name', title: '领用人' },
        { key: 'employee_no', title: '员工工号' },
        { key: 'department', title: '部门' },
        { key: 'remark', title: '备注' },
        { key: 'updated_at', title: '更新时间' },
      ],
      rows: all.map((row) => ({
        ...row,
        status: assetStatusText(row.status),
        location_text: locationText(row),
      })),
    });
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
    const all = await fetchAll({ ...currentFilters(), showArchived: true }, 200);
    const rowsToExport = all.filter((row) => Number(row.archived || 0) === 1);
    if (!rowsToExport.length) return ElMessage.warning('当前没有可导出的归档显示器记录');
    const { exportToXlsx } = await loadExcelUtils();
    exportToXlsx({
      filename: `显示器归档记录_${rowsToExport.length}条.xlsx`,
      sheetName: '显示器归档',
      headers: [
        { key: 'id', title: 'ID' },
        { key: 'asset_code', title: '资产编号' },
        { key: 'sn', title: 'SN' },
        { key: 'brand', title: '品牌' },
        { key: 'model', title: '型号' },
        { key: 'status', title: '状态' },
        { key: 'location_text', title: '位置' },
        { key: 'archived_reason', title: '归档原因' },
        { key: 'archived_note', title: '归档备注' },
        { key: 'archived_by', title: '归档人' },
        { key: 'archived_at', title: '归档时间' },
      ],
      rows: rowsToExport.map((row) => ({
        ...row,
        status: assetStatusText(row.status),
        location_text: locationText(row),
        archived_at: formatBeijingDateTime(row.archived_at),
      })),
    });
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
  const qrLinks = await fetchBulkMonitorAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
  const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
  const records: Array<{ title: string; subtitle?: string; meta: Array<{ label: string; value: string }>; url: string }> = [];
  for (const row of selectedRows.value) {
    const link = qrLinkMap.get(Number(row.id)) || '';
    if (!link) continue;
    records.push({
      title: row.asset_code || `显示器 #${row.id}`,
      subtitle: [row.brand, row.model].filter(Boolean).join(' · ') || `SN：${row.sn || '-'}`,
      meta: [
        { label: '状态', value: assetStatusText(row.status) },
        { label: '位置', value: locationText(row) },
        { label: '领用人', value: row.employee_name || '-' },
        { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
      ],
      url: link,
    });
  }
  if (!records.length) return ElMessage.warning('当前选中项没有可导出的二维码');
  const { downloadQrSheetHtml } = await loadQrCardUtils();
  await downloadQrSheetHtml(`显示器二维码图版_${records.length}条`, '显示器二维码图版', records, template);
  ElMessage.success('二维码图版打印页已导出，可直接打印');
}

async function exportSelectedQrCardsLocal(template?: Partial<QrPrintTemplate>) {
  const qrLinks = await fetchBulkMonitorAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
  const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
  const records = [] as Array<{ title: string; subtitle: string; meta: Array<{ label: string; value: string }>; url: string }>;
  for (const row of selectedRows.value) {
    const url = qrLinkMap.get(Number(row.id)) || '';
    if (!url) continue;
    records.push({
      title: `${row.asset_code || '-'} ${row.brand || ''}`.trim(),
      subtitle: `${row.model || '-'} · SN：${row.sn || '-'}`,
      meta: [
        { label: '状态', value: assetStatusText(row.status) },
        { label: '位置', value: locationText(row) },
        { label: '领用人', value: row.employee_name || '-' },
      ],
      url,
    });
  }
  if (!records.length) return ElMessage.warning('当前选中项没有可导出的二维码');
  const { downloadQrCardsHtml } = await loadQrCardUtils();
  await downloadQrCardsHtml(`显示器二维码卡片_${records.length}条`, '显示器二维码卡片', records, template);
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
    const ids = selectedRows.value.map((row) => Number(row.id));
    const result: any = await apiPost('/api/jobs', { job_type: 'MONITOR_QR_SHEET_EXPORT', request_json: { ids, origin: window.location.origin, print_template: template }, retain_days: 7, max_retries: 1 });
    const jobId = Number(result?.data?.id || result?.id || 0);
    const splitCount = Number(result?.data?.split_count || result?.split_count || 0);
    ElMessage.success(splitCount > 1 ? `已自动拆分为 ${splitCount} 个异步任务，可在“系统工具 / 异步任务”下载二维码图版打印页` : (jobId ? `任务已创建（#${jobId}），可在“系统工具 / 异步任务”下载二维码图版打印页` : '任务已创建，可在“系统工具 / 异步任务”下载二维码图版打印页'));
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

async function refreshLocationMgr() {
  try {
    const rows = await ensureAllLocations(true);
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
    resetLocationCatalog();
    await refreshLocationMgr();
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
    resetLocationCatalog();
    await refreshLocationMgr();
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
    resetLocationCatalog();
    await refreshLocationMgr();
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

onMounted(async () => {
  persistState();
  await load(currentFilters());
  lastRefreshAt = Date.now();
  if (locationId.value) {
    void ensureLocationOptionsReady();
  }
});

onBeforeUnmount(() => {
  schedulePersistState.flush();
});

onActivated(() => {
  if (Date.now() - lastRefreshAt < SOFT_REFRESH_TTL_MS) return;
  lastRefreshAt = Date.now();
  void load(currentFilters(), { keepPage: true });
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
