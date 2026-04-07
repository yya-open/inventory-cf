<template>
  <div class="ledger-page ledger-page--pc">
    <section class="ledger-section ledger-section--toolbar">
      <PcAssetsToolbar
      :mobile-mode="isMobile"
      v-model:status="status"
      v-model:inventory-status="inventoryStatus"
      v-model:keyword="keyword"
      v-model:archive-reason="archiveReason"
      v-model:archive-mode="archiveMode"
      v-model:show-archived="showArchived"
      :is-admin="isAdmin"
      :can-operator="canOperator"
      :visible-columns="displayedPcVisibleColumns"
      :column-order="columnOrder"
      :column-options="displayedPcColumnOptions"
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
      @search="onSearch"
      @set-inventory-filter="setInventoryFilter"
      @reset="reset"
      @export="exportExcel"
      @export-archive="exportArchiveRecords"
      @export-selected="exportSelectedRows"
      @clear-selection="clearSelection"
      @export-selected-qr="exportSelectedQrLinks"
      @export-selected-qr-cards="exportSelectedQrCards"
      @export-selected-qr-png="exportSelectedQrPng"
      @batch-delete="batchDeleteSelected"
      @batch-status="openBatchStatusDialog"
      @batch-owner="openBatchOwnerDialog"
      @batch-archive="batchArchiveSelected"
      @batch-restore="batchRestoreSelected"
      @save-view="handleSaveView"
      @apply-view="handleApplyView"
      @delete-view="handleDeleteView"
      @restore-columns="restoreDefaultColumns"
      @init-qr="initQrKeys"
      @download-template="downloadAssetTemplate"
      @import-file="onImportAssetsFile"
      />
    </section>

    <section class="ledger-section ledger-section--table">
      <el-card shadow="never" class="ledger-table-card">
        <PcAssetsTable
      :mobile-mode="isMobile"
      :rows="rows"
      :loading="refreshing"
      :initial-loading="initialLoading && !rows.length"
      :page="page"
      :page-size="pageSize"
      :total="total"
      :can-operator="canOperator"
      :is-admin="isAdmin"
      :visible-columns="visibleColumns"
      :column-widths="columnWidths"
      :selected-ids="selectedIds"
      :density="density"
      :show-inventory-column="hasActiveInventoryBatch"
      :enable-inventory-highlight="hasActiveInventoryBatch"
      :has-filters="hasActiveFilters"
      @open-info="openInfo"
      @open-edit="openEdit"
      @open-qr="openQr"
      @remove="removeAsset"
      @restore="restoreAsset"
      @open-recommended="openRecommendedAction"
      @selection-change="onSelectionChange"
      @column-resize="updateColumnWidth"
      @page-change="(value) => onPageChange(currentFiltersForList(), value)"
      @page-size-change="(value) => onPageSizeChange(currentFiltersForList(), value)"
      @reset-filters="reset"
        />
      </el-card>
    </section>

    <PcAssetEditDialog
      v-if="lazyEditDialog"
      v-model:visible="editVisible"
      :form="editForm"
      :saving="saving"
      :brand-options="pcBrandOptions"
      @save="saveEdit"
    />
    <PcAssetInfoDialog
      v-if="lazyInfoDialog"
      v-model:visible="infoVisible"
      :row="infoRow"
      @view-audit="openAuditHistory"
    />
    <PcAssetQrDialog
      v-if="lazyQrDialog"
      v-model:visible="qrVisible"
      :loading="qrLoading"
      :data-url="qrDataUrl"
      :link="qrLink"
      :row="qrRow"
      :is-admin="isAdmin"
      :can-export="canQrExport"
      :can-reset="canQrReset"
      :status-text="assetStatusText"
      @download-qr="downloadQr"
      @download-label="downloadLabel"
      @open-link="openQrInNewTab"
      @copy-link="copyQrLink"
      @reset-qr="resetQr"
    />
    <PcAssetBatchStatusDialog
      v-if="lazyBatchStatusDialog"
      v-model:visible="batchStatusVisible"
      v-model:value="batchStatusValue"
      :loading="batchBusy"
      :preview="batchStatusPreview"
      @submit="submitBatchStatus"
    />
    <PcAssetBatchOwnerDialog
      v-if="lazyBatchOwnerDialog"
      v-model:visible="batchOwnerVisible"
      :loading="batchBusy"
      :form="batchOwnerForm"
      :preview="batchOwnerPreview"
      @submit="submitBatchOwner"
    />
    <PcAssetBatchArchiveDialog
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
      scope="pc"
      kind-label="电脑"
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
import { computed, defineAsyncComponent, onBeforeMount, onBeforeUnmount, onActivated, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, ElNotification } from "../utils/el-services";
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import { withDestructiveActionFeedback } from '../utils/destructiveAction';
import { countPcAssets, getPcAssetInventorySummary, listPcAssets } from '../api/assetLedgers';
import { useInventoryBatchStore } from '../composables/useInventoryBatchStore';
import type { InventoryBatchPayload } from '../api/inventoryBatches';
import { fetchBulkPcAssetQrLinks } from '../api/assetQr';
import { exportAssetQrLinksWorkbook, exportAssetQrPrintLocal } from '../utils/assetQrExport';
import { getCachedAssetQr, invalidateAssetQr, setCachedAssetQr } from '../utils/assetQrCache';
import { useAssetLedgerPage } from '../composables/useAssetLedgerPage';
import { useCrossPageSelection } from '../composables/useCrossPageSelection';
import type { AssetInventorySummary, PcAsset, PcFilters } from '../types/assets';
import { assetStatusText, inventoryIssueTypeText, inventoryStatusText } from '../types/assets';
import { formatBeijingDateTime } from '../utils/datetime';
import { getCachedSystemSettings } from '../api/systemSettings';
import { buildQrExportFilename } from '../utils/exportNaming';
import { can, canPerm } from '../store/auth';
import PcAssetsToolbar from '../components/assets/PcAssetsToolbar.vue';
import PcAssetsTable from '../components/assets/PcAssetsTable.vue';
import QrPrintTemplateDialog from '../components/assets/QrPrintTemplateDialog.vue';
import QrExportProgressDialog from '../components/assets/QrExportProgressDialog.vue';
import type { QrPrintTemplate, QrPrintTemplateKind } from '../utils/qrPrintTemplate';
import type { AssetQrExportProgress } from '../utils/assetQrExport';
import { usePcAssetViewState } from './assets/pcAssetViewState';
import { createAssetPagePatchController, applyGenericArchivePatch, applyGenericDeletePatch, applyGenericRestorePatch } from './assets/assetLocalPatch';
import { buildBulkDeleteConfirmTip, extractAffectedIds, summarizeBulkDeleteResult } from './assets/assetBulkActions';

const PcAssetEditDialog = defineAsyncComponent(() => import('../components/assets/PcAssetEditDialog.vue'));
const PcAssetInfoDialog = defineAsyncComponent(() => import('../components/assets/PcAssetInfoDialog.vue'));
const PcAssetQrDialog = defineAsyncComponent(() => import('../components/assets/PcAssetQrDialog.vue'));
const PcAssetBatchStatusDialog = defineAsyncComponent(() => import('../components/assets/PcAssetBatchStatusDialog.vue'));
const PcAssetBatchOwnerDialog = defineAsyncComponent(() => import('../components/assets/PcAssetBatchOwnerDialog.vue'));
const PcAssetBatchArchiveDialog = defineAsyncComponent(() => import('../components/assets/PcAssetBatchArchiveDialog.vue'));

const canOperator = computed(() => can('operator'));
const isAdmin = computed(() => can('admin'));
const canQrExport = computed(() => canPerm('qr_export'));
const canQrReset = computed(() => canPerm('qr_reset'));
const router = useRouter();
const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth <= 900 : false);
const systemSettings = ref(getCachedSystemSettings());
const archiveReasonOptions = computed(() => systemSettings.value.asset_archive_reason_options || []);
const pcBrandOptions = computed(() => systemSettings.value.dictionary_pc_brand_options || []);
const qrTemplateVisible = ref(false);
const qrExportProgress = ref<{ visible: boolean; title: string; stage: string; current: number; total: number; detail: string }>({ visible: false, title: '', stage: '', current: 0, total: 1, detail: '' });
let qrExportProgressAutoCloseTimer: number | null = null;
const qrTemplateKind = ref<QrPrintTemplateKind>('cards');
const qrTemplateAction = ref<'batch-cards' | 'batch-sheet' | 'single-cards' | 'single-sheet'>('batch-cards');
const inventorySummary = ref<AssetInventorySummary>({ unchecked: 0, checked_ok: 0, checked_issue: 0, total: 0 });
const { payload: inventoryBatch, refresh: refreshInventoryBatchStore, lastLoadedAt: inventoryBatchLoadedAt } = useInventoryBatchStore('pc');
const hasActiveInventoryBatch = computed(() => Boolean(inventoryBatch.value.active?.id));
const displayedPcColumnOptions = computed(() => hasActiveInventoryBatch.value ? pcColumnOptions : pcColumnOptions.filter((item) => item.value !== 'inventory'));
const displayedPcVisibleColumns = computed(() => hasActiveInventoryBatch.value ? visibleColumns.value : visibleColumns.value.filter((item) => item !== 'inventory'));
const hasActiveFilters = computed(() => {
  const filters = currentFiltersForList();
  return Boolean(filters.status || filters.keyword || filters.inventoryStatus || filters.archiveMode !== 'active' || filters.archiveReason);
});

const {
  status,
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
  pcColumnOptions,
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
} = usePcAssetViewState(() => {
  void refreshLedgerData();
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
  onSearch();
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

function buildPcBatchExportBaseFilters(): PcFilters {
  return {
    status: '',
    keyword: '',
    archiveReason: '',
    archiveMode: 'active',
    showArchived: false,
    inventoryStatus: '',
  };
}

function mapPcBatchWorkbookRows(rows: PcAsset[]) {
  return rows.map((row, index) => ({
    seq: index + 1,
    brand_model: [row.brand, row.model].filter(Boolean).join(' · ') || '-',
    serial_no: row.serial_no || '-',
    status: assetStatusText(row.status),
    inventory_status: inventoryStatusText(row.inventory_status),
    inventory_at: row.inventory_at || '-',
    inventory_issue_type: String(row.inventory_status || '').toUpperCase() === 'CHECKED_ISSUE' ? inventoryIssueTypeText(row.inventory_issue_type) : '-',
    employee_name: row.last_employee_name || '-',
    employee_no: row.last_employee_no || '-',
    department: row.last_department || '-',
    config_date: row.last_config_date || '-',
    recycle_date: row.last_recycle_date || '-',
    remark: row.remark || '-',
  }));
}

async function exportPcBatchClosingWorkbook(active: NonNullable<InventoryBatchPayload['active']>) {
  const base = buildPcBatchExportBaseFilters();
  const [checkedRows, uncheckedRows, issueRows] = await Promise.all([
    fetchAll({ ...base, inventoryStatus: 'CHECKED_OK' }, 300),
    fetchAll({ ...base, inventoryStatus: 'UNCHECKED' }, 300),
    fetchAll({ ...base, inventoryStatus: 'CHECKED_ISSUE' }, 300),
  ]);
  const { exportWorkbookXlsx } = await loadExcelUtils();
  const filename = `${String(active.name || '电脑盘点').replace(/[\/:*?"<>|]/g, '_')}_${buildBatchExportTimestamp()}_盘点结果.xlsx`;
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
    { key: 'brand_model', title: '电脑' },
    { key: 'serial_no', title: 'SN' },
    { key: 'status', title: '业务状态' },
    { key: 'inventory_status', title: '盘点状态' },
    { key: 'inventory_at', title: '盘点时间' },
    { key: 'inventory_issue_type', title: '异常类型' },
    { key: 'employee_name', title: '当前领用人' },
    { key: 'employee_no', title: '工号' },
    { key: 'department', title: '部门' },
    { key: 'config_date', title: '配置日期' },
    { key: 'recycle_date', title: '回收日期' },
    { key: 'remark', title: '备注' },
  ];
  await exportWorkbookXlsx({
    filename,
    sheets: [
      { sheetName: '汇总', rows: summaryRows },
      { sheetName: '已盘', headers: sheetHeaders, rows: mapPcBatchWorkbookRows(checkedRows) },
      { sheetName: '未盘', headers: sheetHeaders, rows: mapPcBatchWorkbookRows(uncheckedRows) },
      { sheetName: '异常', headers: sheetHeaders, rows: mapPcBatchWorkbookRows(issueRows) },
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

async function buildInlineQrSvg(link: string, size = 260) {
  const QRCode = await loadQrCodeLib();
  const svgMarkup = await QRCode.toString(link, { type: 'svg', width: Number(size), margin: 2, errorCorrectionLevel: 'Q' });
  return {
    svgMarkup,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`
  };
}


const { rows, loading, refreshing, initialLoading, initialized, page, pageSize, total, load, reload, onPageChange, onPageSizeChange, fetchAll, invalidateTotal, invalidateCache } = useAssetLedgerPage<PcFilters, PcAsset>({
  cacheNamespace: 'pc-assets',
  cacheTtlMs: 30_000,
  createFilterKey: (filters) => `status=${filters.status}&inventory=${filters.inventoryStatus || ''}&keyword=${filters.keyword}&archive=${filters.archiveReason || ''}&archived=${filters.showArchived ? 1 : 0}&archiveMode=${filters.archiveMode}`,
  fetchPage: (filters, currentPage, currentPageSize, fast, signal) => listPcAssets(filters, currentPage, currentPageSize, fast, signal),
  fetchTotal: (filters, signal) => countPcAssets(filters, signal),
});

pageSize.value = initialPageSize;
const SOFT_REFRESH_TTL_MS = 30_000;
let lastRefreshAt = 0;

const {
  refreshCurrent,
  patchCurrentRows,
  removeCurrentRows,
  ensureLocalPatchedPageStable,
} = createAssetPagePatchController<PcAsset>({
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

function applyPcStatusPatch(ids: number[], nextStatus: string) {
  patchCurrentRows(ids, (row) => ({ ...row, status: nextStatus }));
}

function applyPcOwnerPatch(ids: number[], payload: { employee_name?: string; employee_no?: string; department?: string }) {
  patchCurrentRows(ids, (row) => ({
    ...row,
    last_employee_name: payload.employee_name || '',
    last_employee_no: payload.employee_no || '',
    last_department: payload.department || '',
    status: row.status === 'ASSIGNED' ? row.status : 'ASSIGNED',
  }));
}

function applyPcArchivePatch(ids: number[], payload: { reason?: string; note?: string }) {
  applyGenericArchivePatch<PcAsset>({
    ids,
    archiveMode: archiveMode.value,
    payload,
    patchCurrentRows,
    removeCurrentRows,
    now: formatBeijingDateTime(new Date().toISOString()),
  });
}

function applyPcRestorePatch(ids: number[]) {
  applyGenericRestorePatch<PcAsset>({
    ids,
    archiveMode: archiveMode.value,
    patchCurrentRows,
    removeCurrentRows,
  });
}

function applyPcDeletePatch(successItems: Array<{ id: number; action: string; reason?: string | null }>) {
  applyGenericDeletePatch<PcAsset>({
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
const batchOwnerVisible = ref(false);
const batchOwnerForm = ref({ employee_name: '', employee_no: '', department: '' });
const batchArchiveVisible = ref(false);
const batchArchiveForm = ref({ reason: systemSettings.value.warehouse_default_archive_reason || '停用归档', note: '' });

const lazyEditDialog = ref(false);
const lazyInfoDialog = ref(false);
const lazyQrDialog = ref(false);
const lazyBatchStatusDialog = ref(false);
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

const batchOwnerPreview = computed(() => {
  const total = selectedRows.value.length;
  const archived = selectedRows.value.filter((row) => Number(row.archived || 0) === 1).length;
  const unassigned = selectedRows.value.filter((row) => Number(row.archived || 0) !== 1 && String(row.status || '') !== 'ASSIGNED').length;
  const sameOwner = selectedRows.value.filter((row) => {
    if (Number(row.archived || 0) === 1 || String(row.status || '') !== 'ASSIGNED') return false;
    const name = String(row.last_employee_name || '').trim();
    const no = String(row.last_employee_no || '').trim();
    const dept = String(row.last_department || '').trim();
    return name === String(batchOwnerForm.value.employee_name || '').trim()
      && no === String(batchOwnerForm.value.employee_no || '').trim()
      && dept === String(batchOwnerForm.value.department || '').trim();
  }).length;
  return { total, archived, unassigned, sameOwner, eligible: Math.max(0, total - archived - unassigned - sameOwner) };
});

const batchArchivePreview = computed(() => {
  const total = selectedRows.value.length;
  const archived = selectedRows.value.filter((row) => Number(row.archived || 0) === 1).length;
  return { total, archived, eligible: Math.max(0, total - archived) };
});

const { selectedIds, selectedRows, selectedCount, syncPageSelection, clearSelection } = useCrossPageSelection<PcAsset>((row) => String(row.id));

bindPersistence(pageSize);

const editVisible = ref(false);
const saving = ref(false);
const editForm = ref<PcAsset>({
  id: 0,
  brand: '',
  model: '',
  serial_no: '',
  manufacture_date: '',
  warranty_end: '',
  disk_capacity: '',
  memory_size: '',
  remark: '',
});
const infoVisible = ref(false);
const infoRow = ref<PcAsset | null>(null);
const qrVisible = ref(false);


const qrLoading = ref(false);
const qrDataUrl = ref('');
const qrSvgMarkup = ref('');
const qrLink = ref('');
const qrRow = ref<PcAsset | null>(null);

function pcQrVersionOf(row?: Partial<PcAsset> | null) {
  return String(row?.qr_updated_at || row?.updated_at || '');
}

function currentFiltersForList(): PcFilters {
  const filters = currentFilters();
  if (!hasActiveInventoryBatch.value) return { ...filters, inventoryStatus: '' };
  return filters;
}

function buildInventorySummaryFilters(filters: PcFilters = currentFiltersForList()): PcFilters {
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

function shouldLoadInventorySummary(filters: PcFilters = currentFiltersForList()) {
  return Boolean(hasActiveInventoryBatch.value || String(filters.inventoryStatus || '').trim());
}

async function refreshInventorySummary(filters: PcFilters = currentFiltersForList()) {
  if (!shouldLoadInventorySummary(filters)) {
    inventorySummary.value = { total: 0, normal: 0, profit: 0, loss: 0, pending: 0 } as any;
    return;
  }
  try {
    if (hasActiveInventoryBatch.value) invalidateAssetInventorySummaryCache('pc');
    inventorySummary.value = await getPcAssetInventorySummary(buildInventorySummaryFilters(filters), undefined, { force: hasActiveInventoryBatch.value });
  } catch (error) {
    console.warn('pc inventory summary failed', error);
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

function scheduleAuxiliaryRefresh(initialFilters: PcFilters) {
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

const onSearch = () => {
  void refreshLedgerData();
};
const reset = () => {
  runWithoutAutoSearch(() => {
    status.value = '';
    inventoryStatus.value = '';
    keyword.value = '';
    showArchived.value = false;
    archiveMode.value = 'active';
    archiveReason.value = '';
  });
  void refreshLedgerData();
};

async function initQrKeys() {
  if (initQrBusy.value) return;
  try {
    await ElMessageBox.confirm('将把“补齐电脑二维码 Key”提交到异步任务中心后台执行。继续？', '初始化二维码Key', { type: 'warning' });
    initQrBusy.value = true;
    const result: any = await apiPost('/api/jobs', { job_type: 'PC_QR_KEY_INIT', request_json: { batch: 200 }, retain_days: 7, max_retries: 1 });
    const jobId = Number(result?.data?.id || result?.id || 0);
    ElMessage.success(jobId ? `任务已创建（#${jobId}），可在“系统工具 / 异步任务”查看进度` : '任务已创建，可在“系统工具 / 异步任务”查看进度');
  } catch (error: any) {
    if (error?.message) ElMessage.error(error.message);
  } finally {
    initQrBusy.value = false;
  }
}


function buildPcQrSheetRecord(row: PcAsset, url: string, template?: Partial<QrPrintTemplate>) {
  if (!url) return null;
  const mode = template?.content_mode || 'detail';
  const modelText = [row.brand, row.model].filter(Boolean).join(' ') || `电脑 #${row.id}`;
  const serialNo = row.serial_no || '-';
  if (mode === 'qr_only') return { title: '', subtitle: '', meta: [], url };
  if (mode === 'model_sn') return { title: modelText, subtitle: `SN：${serialNo}`, meta: [], url };
  if (mode === 'model_asset') return { title: modelText, subtitle: `编号：${row.id || '-'}`, meta: [], url };
  return {
    title: [row.brand, row.model].filter(Boolean).join(' · ') || `电脑 #${row.id}`,
    subtitle: `SN：${serialNo} · 状态：${assetStatusText(row.status)}`,
    meta: [
      { label: '领用人', value: row.last_employee_name || '-' },
      { label: '工号', value: row.last_employee_no || '-' },
      { label: '部门', value: row.last_department || '-' },
      { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
    ],
    url,
  };
}

function buildPcQrCardRecord(row: PcAsset, url: string, template?: Partial<QrPrintTemplate>) {
  if (!url) return null;
  const mode = template?.content_mode || 'detail';
  const modelText = [row.brand, row.model].filter(Boolean).join(' ') || `电脑 #${row.id}`;
  const serialNo = row.serial_no || '-';
  if (mode === 'qr_only') return { title: '', subtitle: '', meta: [], url };
  if (mode === 'model_sn') return { title: modelText, subtitle: `SN：${serialNo}`, meta: [], url };
  if (mode === 'model_asset') return { title: modelText, subtitle: `编号：${row.id || '-'}`, meta: [], url };
  return {
    title: `${row.brand || '-'} ${row.model || ''}`.trim(),
    subtitle: `SN：${serialNo}`,
    meta: [
      { label: '状态', value: assetStatusText(row.status) },
      { label: '序列号', value: serialNo },
      { label: '领用人', value: row.last_employee_name || '-' },
    ],
    url,
  };
}

async function exportSinglePcQrSheet(template?: Partial<QrPrintTemplate>) {
  if (!qrRow.value) return;
  const result = await exportAssetQrPrintLocal({
    mode: 'sheet',
    rows: [qrRow.value],
    getId: (row) => Number(row.id),
    fetchBulkLinks: fetchBulkPcAssetQrLinks,
    mapPrintRecord: (row, url) => buildPcQrSheetRecord(row, url, template),
    loadQrCardUtils,
    filename: buildQrExportFilename({ scope: 'pc', kind: 'sheet', count: 1, template, singleLabel: `电脑二维码_${qrRow.value.serial_no || qrRow.value.id || 'pc'}` }),
    title: '电脑二维码',
    template,
    onProgress: updateQrExportProgress,
  });
  if (result.empty) return ElMessage.warning('当前记录没有可导出的二维码');
  ElMessage.success('二维码打印页已导出，可直接打印');
}

async function exportSinglePcQrCard(template?: Partial<QrPrintTemplate>) {
  if (!qrRow.value) return;
  const result = await exportAssetQrPrintLocal({
    mode: 'cards',
    rows: [qrRow.value],
    getId: (row) => Number(row.id),
    fetchBulkLinks: fetchBulkPcAssetQrLinks,
    mapPrintRecord: (row, url) => buildPcQrCardRecord(row, url, template),
    loadQrCardUtils,
    filename: buildQrExportFilename({ scope: 'pc', kind: 'cards', count: 1, template, singleLabel: `电脑标签_${qrRow.value.serial_no || qrRow.value.id || 'pc'}` }),
    title: '电脑标签',
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
    fetchBulkLinks: fetchBulkPcAssetQrLinks,
    mapPrintRecord: (row, url) => buildPcQrSheetRecord(row, url, template),
    loadQrCardUtils,
    filename: buildQrExportFilename({ scope: 'pc', kind: 'sheet', count: selectedRows.value.length, template }),
    title: '电脑二维码图版',
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
    fetchBulkLinks: fetchBulkPcAssetQrLinks,
    mapPrintRecord: (row, url) => buildPcQrCardRecord(row, url, template),
    loadQrCardUtils,
    filename: buildQrExportFilename({ scope: 'pc', kind: 'cards', count: selectedRows.value.length, template }),
    title: '电脑二维码卡片',
    template,
    onProgress: updateQrExportProgress,
  });
  if (result.empty) return ElMessage.warning('当前选中项没有可导出的二维码');
  ElMessage.success('二维码卡片已导出，可直接打印');
}

function openQrPrintTemplate(kind: QrPrintTemplateKind, action?: 'batch-cards' | 'batch-sheet' | 'single-cards' | 'single-sheet') {
  if (!canQrExport.value) return ElMessage.warning('当前账号没有二维码/标签导出权限');
  const nextAction = action || (kind === 'cards' ? 'batch-cards' : 'batch-sheet');
  if (nextAction.startsWith('batch') && !selectedCount.value) return ElMessage.warning('请先勾选电脑');
  if (nextAction.startsWith('single') && !qrRow.value?.id) return ElMessage.warning('请先打开要导出的二维码');
  qrTemplateKind.value = kind;
  qrTemplateAction.value = nextAction;
  qrTemplateVisible.value = true;
}

async function submitQrPrintTemplate(template: QrPrintTemplate) {
  if (qrTemplateAction.value === 'single-cards') {
    try {
      startQrExportProgress('正在导出二维码标签');
      await exportSinglePcQrCard(template);
    } finally {
      finishQrExportProgress();
    }
    return;
  }
  if (qrTemplateAction.value === 'single-sheet') {
    try {
      startQrExportProgress('正在导出二维码图版');
      await exportSinglePcQrSheet(template);
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
    finishQrExportProgress();
  }
}

function exportSelectedQrPng() {
  openQrPrintTemplate('sheet');
}

function openAuditHistory(row?: PcAsset | null) {
  const id = Number(row?.id || infoRow.value?.id || 0);
  if (!id) return;
  infoVisible.value = false;
  router.push({ path: '/system/audit', query: { entity: 'pc_assets', entity_id: String(id), module: 'PC' } });
}

async function openQr(row: PcAsset) {
  qrRow.value = row;
  warmLazyDialog(lazyQrDialog);
  qrVisible.value = true;
  qrLoading.value = true;
  qrDataUrl.value = '';
  qrSvgMarkup.value = '';
  qrLink.value = '';
  try {
    const id = Number(row?.id || 0);
    if (!id) throw new Error('缺少资产ID');
    const version = pcQrVersionOf(row);
    const cached = getCachedAssetQr('pc', id, version);
    if (cached) {
      qrLink.value = cached.link;
      qrDataUrl.value = cached.dataUrl;
      qrSvgMarkup.value = cached.svgMarkup || '';
      return;
    }
    const result: any = await apiGet(`/api/pc-asset-qr-token?id=${encodeURIComponent(String(id))}`);
    const link = String(result?.url || '');
    if (!link) throw new Error('二维码链接生成失败');
    qrLink.value = link;
    const qrImage = await buildInlineQrSvg(link, 260);
    qrDataUrl.value = qrImage.dataUrl;
    qrSvgMarkup.value = qrImage.svgMarkup;
    setCachedAssetQr('pc', id, version, { link, dataUrl: qrImage.dataUrl, svgMarkup: qrImage.svgMarkup });
  } catch (error: any) {
    ElMessage.error(error?.message || '生成二维码失败');
    qrVisible.value = false;
  } finally {
    qrLoading.value = false;
  }
}

async function resetQr() {
  if (!canQrReset.value) return ElMessage.warning('当前账号没有重置二维码权限');
  try {
    if (!qrRow.value?.id) return;
    await ElMessageBox.confirm('确认要重置该电脑的二维码吗？重置后旧二维码将立即失效。', '重置二维码', { type: 'warning' });
    qrLoading.value = true;
    const assetId = Number(qrRow.value.id);
    invalidateAssetQr('pc', assetId);
    const result: any = await apiPost(`/api/pc-assets-reset-qr?id=${encodeURIComponent(String(assetId))}`, {});
    const link = String(result?.url || '');
    qrLink.value = link;
    const qrImage = await buildInlineQrSvg(link, 260);
    qrDataUrl.value = qrImage.dataUrl;
    qrSvgMarkup.value = qrImage.svgMarkup;
    const version = new Date().toISOString();
    qrRow.value = qrRow.value ? { ...qrRow.value, qr_updated_at: version } : qrRow.value;
    setCachedAssetQr('pc', assetId, version, { link, dataUrl: qrImage.dataUrl, svgMarkup: qrImage.svgMarkup });
    ElMessage.success('已重置，新二维码已生成');
  } catch (error: any) {
    if (error?.message) ElMessage.error(error.message);
  } finally {
    qrLoading.value = false;
  }
}

async function copyQrLink() {
  try {
    if (!qrLink.value) return;
    await navigator.clipboard.writeText(qrLink.value);
    ElMessage.success('已复制');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = qrLink.value;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    ElMessage.success('已复制');
  }
}

async function downloadLabel() {
  openQrPrintTemplate('cards', 'single-cards');
}

function downloadQr() {
  openQrPrintTemplate('sheet', 'single-sheet');
}

const openQrInNewTab = () => {
  if (qrLink.value) window.open(qrLink.value, '_blank');
};

function openEdit(row: PcAsset) {
  editForm.value = {
    id: row.id,
    brand: row.brand || '',
    model: row.model || '',
    serial_no: row.serial_no || '',
    manufacture_date: row.manufacture_date || '',
    warranty_end: row.warranty_end || '',
    disk_capacity: row.disk_capacity || '',
    memory_size: row.memory_size || '',
    remark: row.remark || '',
  };
  warmLazyDialog(lazyEditDialog);
  editVisible.value = true;
}

function openInfo(row: PcAsset) {
  infoRow.value = { ...row };
  warmLazyDialog(lazyInfoDialog);
  infoVisible.value = true;
}

async function saveEdit() {
  const form = editForm.value || {};
  const trim = (value: unknown) => String(value ?? '').trim();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const payload = {
    ...form,
    brand: trim(form.brand),
    model: trim(form.model),
    serial_no: trim(form.serial_no),
    manufacture_date: trim(form.manufacture_date),
    warranty_end: trim(form.warranty_end),
    disk_capacity: trim(form.disk_capacity),
    memory_size: trim(form.memory_size),
    remark: trim(form.remark),
  };

  if (!payload.brand) return ElMessage.warning('品牌必填');
  if (!payload.model) return ElMessage.warning('型号必填');
  if (!payload.serial_no) return ElMessage.warning('序列号必填');
  if (payload.manufacture_date && !datePattern.test(payload.manufacture_date)) return ElMessage.warning('出厂时间格式需为 YYYY-MM-DD');
  if (payload.warranty_end && !datePattern.test(payload.warranty_end)) return ElMessage.warning('保修到期格式需为 YYYY-MM-DD');

  try {
    saving.value = true;
    editForm.value = { ...payload };
    await apiPut('/api/pc-assets', payload);
    ElMessage.success('修改成功');
    notifyAction('电脑台账已更新', `已更新 ${payload.brand} ${payload.model}`.trim() || '电脑记录');
    editVisible.value = false;
    if (systemSettings.value.ui_write_local_refresh) {
      patchCurrentRows([Number(payload.id)], (row) => ({
        ...row,
        brand: payload.brand,
        model: payload.model,
        serial_no: payload.serial_no,
        manufacture_date: payload.manufacture_date || '',
        warranty_end: payload.warranty_end || '',
        disk_capacity: payload.disk_capacity || '',
        memory_size: payload.memory_size || '',
        remark: payload.remark || '',
      }));
      await ensureLocalPatchedPageStable(false);
    } else {
      await refreshCurrent(true, true);
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '修改失败');
  } finally {
    saving.value = false;
  }
}

async function removeAsset(row: PcAsset) {
  const isArchived = Number(row.archived || 0) === 1;
  const label = `${row.brand || ''} ${row.model || ''}`.trim();
  try {
    const preview: any = await apiPost('/api/pc-assets-bulk', { action: 'delete', ids: [Number(row.id)], preview_only: true });
    const previewItem = Array.isArray(preview?.data?.items) ? preview.data.items[0] : null;
    if (previewItem?.blocked) {
      throw Object.assign(new Error(String(previewItem?.reason || '当前资产暂不支持删除')), { status: 400 });
    }
    const operation = String(previewItem?.operation || (isArchived ? 'purge' : 'delete'));
    const relatedTotal = Number(previewItem?.related_total || 0);
    const reason = String(previewItem?.reason || '');
    const message = operation === 'purge'
      ? `确认彻底删除归档电脑：${label}（SN: ${row.serial_no || '-'}）？本次将清理 ${relatedTotal} 条关联记录。${reason}`
      : operation === 'archive'
        ? `确认删除电脑台账：${label}（SN: ${row.serial_no || '-'}）？预检结果：本次不会物理删除，而会自动归档。${reason}`
        : `确认删除电脑台账：${label}（SN: ${row.serial_no || '-'}）？预检结果：满足物理删除条件。`;
    await ElMessageBox.confirm(message, operation === 'purge' ? '彻底删除预检' : '删除预检', {
      type: 'warning',
      confirmButtonText: operation === 'purge' ? '确认彻底删除' : '确认删除',
      cancelButtonText: '取消',
    });
    batchBusy.value = true;
    const result: any = await withDestructiveActionFeedback('正在删除电脑台账', () => apiPost('/api/pc-assets-bulk', { action: 'delete', ids: [Number(row.id)] }));
    if (Array.isArray(result?.success_items)) applyPcDeletePatch(result.success_items);
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


async function restoreAsset(row: PcAsset) {
  try {
    await ElMessageBox.confirm(`确认恢复电脑：${row.brand || ''} ${row.model || ''}（SN: ${row.serial_no || '-'}）？恢复后将重新出现在默认台账列表中。`, '恢复归档', {
      type: 'warning',
      confirmButtonText: '确认恢复',
      cancelButtonText: '取消',
    });
    batchBusy.value = true;
    const result: any = await apiPost('/api/pc-assets-bulk', { action: 'restore', ids: [Number(row.id)] });
    ElMessage.success(result?.message || '恢复成功');
    applyPcRestorePatch(extractAffectedIds(result, [Number(row.id)]));
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
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  try {
    batchBusy.value = true;
    await exportAssetQrLinksWorkbook({
      rows: selectedRows.value,
      getId: (row) => Number(row.id),
      fetchBulkLinks: fetchBulkPcAssetQrLinks,
      loadExcelUtils,
      filename: `电脑二维码链接_${selectedCount.value}条.xlsx`,
      headers: [
        { key: 'id', title: 'ID' },
        { key: 'brand', title: '品牌' },
        { key: 'model', title: '型号' },
        { key: 'serial_no', title: '序列号' },
        { key: 'status', title: '状态' },
        { key: 'url', title: '二维码链接' },
      ],
      mapWorkbookRow: (row, url) => ({
        id: row.id,
        brand: row.brand,
        model: row.model,
        serial_no: row.serial_no,
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
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  batchStatusValue.value = 'IN_STOCK';
  warmLazyDialog(lazyBatchStatusDialog);
  batchStatusVisible.value = true;
}

function openBatchOwnerDialog() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  batchOwnerForm.value = { employee_name: '', employee_no: '', department: '' };
  warmLazyDialog(lazyBatchOwnerDialog);
  batchOwnerVisible.value = true;
}

async function submitBatchStatus() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  try {
    batchBusy.value = true;
    const result: any = await apiPost('/api/pc-assets-bulk', {
      action: 'status',
      ids: selectedIds.value.map((id) => Number(id)),
      status: batchStatusValue.value,
    });
    ElMessage.success(result?.message || '批量修改成功');
    notifyAction('批量状态已更新', `已处理 ${selectedCount.value} 台电脑的状态。`);
    batchStatusVisible.value = false;
    applyPcStatusPatch(extractAffectedIds(result), batchStatusValue.value);
    clearSelection();
    await ensureLocalPatchedPageStable();
  } catch (error: any) {
    ElMessage.error(error?.message || '批量修改状态失败');
  } finally {
    batchBusy.value = false;
  }
}


async function submitBatchOwner() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  if (!String(batchOwnerForm.value.employee_name || '').trim()) return ElMessage.warning('请输入领用人');
  try {
    batchBusy.value = true;
    const result: any = await apiPost('/api/pc-assets-bulk', {
      action: 'owner',
      ids: selectedIds.value.map((id) => Number(id)),
      employee_name: batchOwnerForm.value.employee_name,
      employee_no: batchOwnerForm.value.employee_no,
      department: batchOwnerForm.value.department,
    });
    ElMessage.success(result?.message || '批量修改领用人成功');
    notifyAction('批量领用人已更新', `已处理 ${selectedCount.value} 台电脑的领用信息。`);
    batchOwnerVisible.value = false;
    applyPcOwnerPatch(extractAffectedIds(result), batchOwnerForm.value);
    clearSelection();
    await ensureLocalPatchedPageStable();
  } catch (error: any) {
    ElMessage.error(error?.message || '批量修改领用人失败');
  } finally {
    batchBusy.value = false;
  }
}

async function batchRestoreSelected() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  try {
    await confirmBatchRisk('批量恢复归档', `预计恢复 ${selectedRows.value.filter((row) => Number(row.archived || 0) === 1).length} 台电脑。恢复后将重新出现在默认台账列表中，请输入“确认”继续。`);
    batchBusy.value = true;
    const result: any = await apiPost('/api/pc-assets-bulk', {
      action: 'restore',
      ids: selectedIds.value.map((id) => Number(id)),
    });
    ElMessage.success(result?.message || '批量恢复成功');
    notifyAction('批量恢复完成', `已恢复 ${selectedCount.value} 台电脑。`, 'info');
    applyPcRestorePatch(extractAffectedIds(result));
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
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  batchArchiveForm.value = { reason: systemSettings.value.warehouse_default_archive_reason || archiveReasonOptions.value[0] || '停用归档', note: '' };
  warmLazyDialog(lazyBatchArchiveDialog);
  batchArchiveVisible.value = true;
}

async function submitBatchArchive() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  if (!String(batchArchiveForm.value.reason || '').trim()) return ElMessage.warning('请选择归档原因');
  try {
    await confirmBatchRisk('批量归档确认', `此操作会归档选中的 ${selectedCount.value} 台电脑，默认列表将不再显示，请输入“确认”继续。`);
    batchBusy.value = true;
    const result: any = await apiPost('/api/pc-assets-bulk', {
      action: 'archive',
      ids: selectedIds.value.map((id) => Number(id)),
      reason: batchArchiveForm.value.reason,
      note: batchArchiveForm.value.note,
    });
    ElMessage.success(result?.message || '批量归档成功');
    notifyAction('批量归档完成', `已归档 ${selectedCount.value} 台电脑。`, 'warning');
    batchArchiveVisible.value = false;
    applyPcArchivePatch(extractAffectedIds(result), batchArchiveForm.value);
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
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  try {
    const archivedCount = selectedRows.value.filter((row) => Number(row.archived || 0) === 1).length;
    await confirmBatchRisk('批量删除确认', buildBulkDeleteConfirmTip('电脑', selectedCount.value, archivedCount));
    batchBusy.value = true;
    const result: any = await withDestructiveActionFeedback('正在批量删除电脑台账', () => apiPost('/api/pc-assets-bulk', {
      action: 'delete',
      ids: selectedIds.value.map((id) => Number(id)),
    }));
    const summary = summarizeBulkDeleteResult('电脑', result);
    if (summary.processed) clearSelection();
    if (summary.level === 'success') ElMessage.success(summary.message);
    else if (summary.level === 'warning') ElMessage.warning(summary.message);
    if (Array.isArray(result?.success_items)) applyPcDeletePatch(result.success_items);
    if (summary.failedRecords.length) await exportBatchFailures(`电脑批量删除失败明细_${summary.failedRecords.length}条.xlsx`, summary.failedRecords);
    await ensureLocalPatchedPageStable(true);
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || '批量删除失败');
  } finally {
    batchBusy.value = false;
  }
}

async function exportSelectedRows() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选要导出的电脑');
  try {
    exportBusy.value = true;
    const actions = await loadAssetLedgerExportActions();
    await actions.exportPcSelectedRows({ rows: selectedRows.value, loadExcelUtils, assetStatusText, formatBeijingDateTime });
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
    await actions.exportPcAllRows({ rows: all, loadExcelUtils, assetStatusText, formatBeijingDateTime });
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
    if (!rowsToExport.length) return ElMessage.warning('当前没有可导出的归档电脑记录');
    const actions = await loadAssetLedgerExportActions();
    await actions.exportPcArchiveRows({ rows: rowsToExport, loadExcelUtils, assetStatusText, formatBeijingDateTime });
    ElMessage.success('归档电脑记录已导出');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出归档记录失败');
  } finally {
    exportBusy.value = false;
  }
}

async function downloadAssetTemplate() {
  const { downloadTemplate } = await loadExcelUtils();
  downloadTemplate({
    filename: '电脑台账导入模板.xlsx',
    headers: [
      { title: '品牌' },
      { title: '序列号' },
      { title: '型号' },
      { title: '出厂时间' },
      { title: '保修到期' },
      { title: '硬盘容量' },
      { title: '内存大小' },
      { title: '备注' },
    ],
    exampleRows: [
      {
        品牌: 'Dell',
        序列号: 'SN123456',
        型号: 'Latitude 5440',
        出厂时间: '2024-01-01',
        保修到期: '2027-01-01',
        硬盘容量: '512G',
        内存大小: '16G',
        备注: '示例，可删除该行',
      },
    ],
  });
}

async function onImportAssetsFile(uploadFile: any) {
  if (importBusy.value) return;
  const file: File = uploadFile?.raw;
  if (!file) return;
  try {
    importBusy.value = true;
    const { parseXlsx } = await loadExcelUtils();
    const excelRows = await parseXlsx(file);
    const items = excelRows
      .map((row) => ({
        brand: String(row['品牌'] ?? row.brand ?? '').trim(),
        serial_no: String(row['序列号'] ?? row.serial_no ?? '').trim(),
        model: String(row['型号'] ?? row.model ?? '').trim(),
        manufacture_date: String(row['出厂时间'] ?? row.manufacture_date ?? '').trim(),
        warranty_end: String(row['保修到期'] ?? row.warranty_end ?? '').trim(),
        disk_capacity: String(row['硬盘容量'] ?? row.disk_capacity ?? '').trim(),
        memory_size: String(row['内存大小'] ?? row.memory_size ?? '').trim(),
        remark: String(row['备注'] ?? row.remark ?? '').trim(),
      }))
      .filter((item) => item.brand || item.serial_no || item.model);

    if (!items.length) return ElMessage.warning('Excel里没有可导入的数据');

    const missingManufactureDate = items
      .map((item, index) => ({ index, value: String(item.manufacture_date || '').trim() }))
      .filter((entry) => !entry.value)
      .slice(0, 15)
      .map((entry) => entry.index + 2);

    if (missingManufactureDate.length) {
      return ElMessage.warning(`出厂时间必填，缺失行号：${missingManufactureDate.join(', ')}${missingManufactureDate.length >= 15 ? ' …' : ''}`);
    }

    const result: any = await apiPost('/api/pc-in-batch', { items });
    const failed = Number(result?.failed || 0);
    if (failed > 0) {
      ElMessage.warning(`导入完成：成功 ${result.success} 条，失败 ${failed} 条（请查看控制台/接口返回 errors）`);
      console.warn('pc-in-batch errors', result?.errors);
    } else {
      ElMessage.success(`导入完成：成功 ${result.success} 条`);
    }
    await refreshCurrent(true, true);
  } catch (error: any) {
    ElMessage.error(error?.message || '导入失败');
  } finally {
    importBusy.value = false;
  }
}

function onSelectionChange(currentPageSelected: PcAsset[]) {
  syncPageSelection(rows.value, currentPageSelected);
}

function setInventoryFilter(nextStatus: string) {
  const normalized = String(nextStatus || '');
  inventoryStatus.value = inventoryStatus.value === normalized ? '' : normalized;
  onSearch();
}

function openRecommendedAction(command: string, row: PcAsset) {
  const keywordText = String(row?.serial_no || row?.brand || row?.model || row?.id || '').trim();
  if (command === 'qr') return openQr(row);
  if (command === 'edit') return openEdit(row);
  void router.push({
    path: '/pc/inventory-logs',
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
    radial-gradient(circle at top left, rgba(64, 158, 255, 0.16), transparent 38%),
    radial-gradient(circle at top right, rgba(24, 144, 255, 0.10), transparent 32%),
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
  background: linear-gradient(180deg, rgba(64, 158, 255, 0.09), rgba(64, 158, 255, 0));
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
