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
      :can-bulk-operation="canBulkOperation"
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
      :default-view-name="defaultViewName"
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
      @set-default-view="handleSetDefaultView"
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
import { ElMessage } from "../utils/el-services";
import { apiDelete, apiPost, apiPut } from '../api/client';
import { withBlockingActionFeedback } from '../utils/operationFeedback';
import { withDestructiveActionFeedback } from '../utils/destructiveAction';
import { confirmLedgerAction, notifyLedgerAction as notifyAction, showLedgerError, showLedgerSuccess } from '../utils/ledgerOperationFeedback';
import { countPcAssets, getPcAssetInventorySummary, invalidateAssetInventorySummaryCache, listPcAssets } from '../api/assetLedgers';
import { useInventoryBatchStore } from '../composables/useInventoryBatchStore';
import { fetchBulkPcAssetQrLinks } from '../api/assetQr';
import { useAssetLedgerPage } from '../composables/useAssetLedgerPage';
import { useCrossPageSelection } from '../composables/useCrossPageSelection';
import { useAssetQrDialog } from '../composables/useAssetQrDialog';
import { useAssetQrExportActions } from '../composables/useAssetQrExportActions';
import { useQrExportProgress } from '../composables/useQrExportProgress';
import { useAssetSelectionSummary } from '../composables/useAssetSelectionSummary';
import { useAssetBulkActions } from '../composables/useAssetBulkActions';
import { invalidatePagedListNamespace } from '../composables/usePagedAssetList';
import { trimText, useAssetFormActions, validateRequiredFields } from '../composables/useAssetFormActions';
import { assetStatusText, type AssetInventorySummary, type PcAsset, type PcFilters } from '../types/assets';
import { formatBeijingDateTime } from '../utils/datetime';
import { getCachedSystemSettings } from '../api/systemSettings';
import { isLedgerMobileViewport } from '../utils/responsive';
import { can, canCapability, canPerm } from '../store/auth';
import PcAssetsToolbar from '../components/assets/PcAssetsToolbar.vue';
import PcAssetsTable from '../components/assets/PcAssetsTable.vue';
import type { QrPrintTemplate } from '../utils/qrPrintTemplate';
import { usePcAssetViewState } from './assets/pcAssetViewState';
import { createAssetPagePatchController, applyGenericArchivePatch, applyGenericDeletePatch, applyGenericRestorePatch } from './assets/assetLocalPatch';
import { extractAffectedIds } from './assets/assetBulkActions';

const PcAssetEditDialog = defineAsyncComponent(() => import('../components/assets/PcAssetEditDialog.vue'));
const PcAssetInfoDialog = defineAsyncComponent(() => import('../components/assets/PcAssetInfoDialog.vue'));
const PcAssetQrDialog = defineAsyncComponent(() => import('../components/assets/PcAssetQrDialog.vue'));
const PcAssetBatchStatusDialog = defineAsyncComponent(() => import('../components/assets/PcAssetBatchStatusDialog.vue'));
const PcAssetBatchOwnerDialog = defineAsyncComponent(() => import('../components/assets/PcAssetBatchOwnerDialog.vue'));
const PcAssetBatchArchiveDialog = defineAsyncComponent(() => import('../components/assets/PcAssetBatchArchiveDialog.vue'));
const QrPrintTemplateDialog = defineAsyncComponent(() => import('../components/assets/QrPrintTemplateDialog.vue'));
const QrExportProgressDialog = defineAsyncComponent(() => import('../components/assets/QrExportProgressDialog.vue'));

const canOperator = computed(() => can('operator'));
const isAdmin = computed(() => can('admin'));
const canBulkOperation = computed(() => canPerm('bulk_operation'));
const canQrExport = computed(() => canCapability('qr.export'));
const canQrReset = computed(() => canCapability('qr.reset'));
const router = useRouter();
const isMobile = ref(typeof window !== 'undefined' ? isLedgerMobileViewport() : false);
const systemSettings = ref(getCachedSystemSettings());
const archiveReasonOptions = computed(() => systemSettings.value.asset_archive_reason_options || []);
const pcBrandOptions = computed(() => systemSettings.value.dictionary_pc_brand_options || []);
const { runSaveAction } = useAssetFormActions();
const { qrExportProgress, startQrExportProgress, updateQrExportProgress, finishQrExportProgress } = useQrExportProgress();
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
} = useAssetQrDialog<PcAsset>({
  kind: 'pc',
  size: 260,
  canReset: canQrReset,
  getId: (row) => Number(row.id || 0),
  getVersion: (row) => String(row?.qr_updated_at || row?.updated_at || ''),
  qrTokenPath: (id) => `/api/pc-asset-qr-token?id=${encodeURIComponent(String(id))}`,
  resetQrPath: (id) => `/api/pc-assets-reset-qr?id=${encodeURIComponent(String(id))}`,
  closeOnOpenError: true,
  messages: {
    noPermission: '当前账号没有重置二维码权限',
    missingId: '缺少资产ID',
    emptyLink: '二维码链接生成失败',
    generateFailed: '生成二维码失败',
    copySuccess: '已复制',
    copyFailed: '复制失败，请手动复制',
    resetTitle: '重置二维码',
    resetConfirm: '确认要重置该电脑的二维码吗？重置后旧二维码将立即失效。',
    resetConfirmButton: '重置',
    resetSuccess: '已重置，新二维码已生成',
    resetFailed: '重置失败',
  },
});
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
  defaultViewName,
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
  setDefaultSavedView,
  getDefaultSavedView,
  runWithoutAutoSearch,
} = usePcAssetViewState(() => {
  void refreshLedgerData();
});


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

function loadAssetLedgerExportActions() {
  return import('./assets/assetLedgerExportActions');
}

function loadQrCardUtils() {
  qrCardUtilsPromise ||= import('../utils/qrCards');
  return qrCardUtilsPromise;
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
  const { total, archived } = selectionSummary.value;
  let sameStatus = 0;
  for (const row of selectedRows.value) {
    if (Number(row.archived || 0) !== 1 && String(row.status || '') === String(batchStatusValue.value || '')) sameStatus += 1;
  }
  return { total, archived, sameStatus, eligible: Math.max(0, total - archived - sameStatus) };
});

const batchOwnerPreview = computed(() => {
  const { total, archived } = selectionSummary.value;
  let unassigned = 0;
  let sameOwner = 0;
  for (const row of selectedRows.value) {
    if (Number(row.archived || 0) === 1) continue;
    if (String(row.status || '') !== 'ASSIGNED') {
      unassigned += 1;
      continue;
    }
    const name = String(row.last_employee_name || '').trim();
    const no = String(row.last_employee_no || '').trim();
    const dept = String(row.last_department || '').trim();
    if (name === String(batchOwnerForm.value.employee_name || '').trim()
      && no === String(batchOwnerForm.value.employee_no || '').trim()
      && dept === String(batchOwnerForm.value.department || '').trim()) {
      sameOwner += 1;
    }
  }
  return { total, archived, unassigned, sameOwner, eligible: Math.max(0, total - archived - unassigned - sameOwner) };
});

const batchArchivePreview = computed(() => {
  const { total, archived } = selectionSummary.value;
  return { total, archived, eligible: Math.max(0, total - archived) };
});

const { selectedIds, selectedRows, selectedCount, syncPageSelection, clearSelection } = useCrossPageSelection<PcAsset>((row) => String(row.id));
const { selectionSummary, selectedNumberIds } = useAssetSelectionSummary(selectedRows);
const {
  confirmBatchRisk,
  runBulkAction,
  runBulkDelete,
} = useAssetBulkActions({
  endpoint: '/api/pc-assets-bulk',
  assetLabel: '电脑',
  selectedCount,
  selectedNumberIds,
  archivedCount: computed(() => selectionSummary.value.archived),
  batchBusy,
  clearSelection,
  ensureLocalPatchedPageStable,
  loadExcelUtils,
});
const {
  qrTemplateVisible,
  qrTemplateKind,
  openQrPrintTemplate,
  submitQrPrintTemplate,
  exportSelectedQrLinks,
  exportSelectedQrCards,
  exportSelectedQrPng,
  downloadQr,
  downloadLabel,
} = useAssetQrExportActions<PcAsset>({
  scope: 'pc',
  canExport: canQrExport,
  selectedRows,
  selectedCount,
  singleRow: qrRow,
  exportBusy,
  batchBusy,
  getId: (row) => Number(row.id),
  fetchBulkLinks: fetchBulkPcAssetQrLinks,
  loadExcelUtils,
  loadQrCardUtils,
  mapSheetRecord: buildPcQrSheetRecord,
  mapCardRecord: buildPcQrCardRecord,
  linkFilename: (count) => `电脑二维码链接_${count}条.xlsx`,
  linkHeaders: [
    { key: 'id', title: 'ID' },
    { key: 'brand', title: '品牌' },
    { key: 'model', title: '型号' },
    { key: 'serial_no', title: '序列号' },
    { key: 'status', title: '状态' },
    { key: 'url', title: '二维码链接' },
  ],
  mapLinkWorkbookRow: (row, url) => ({
    id: row.id,
    brand: row.brand,
    model: row.model,
    serial_no: row.serial_no,
    status: assetStatusText(row.status),
    url,
  }),
  singleSheetLabel: (row) => `电脑二维码_${row.serial_no || row.id || 'pc'}`,
  singleCardsLabel: (row) => `电脑标签_${row.serial_no || row.id || 'pc'}`,
  sheetTitle: '电脑二维码',
  cardsTitle: '电脑标签',
  selectedSheetTitle: '电脑二维码图版',
  selectedCardsTitle: '电脑二维码卡片',
  messages: {
    noPermission: '当前账号没有二维码/标签导出权限',
    noSelection: '请先勾选电脑',
    noSingle: '请先打开要导出的二维码',
    selectedEmpty: '当前选中项没有可导出的二维码',
    singleEmpty: '当前记录没有可导出的二维码',
    sheetSuccess: '二维码打印页已导出，可直接打印',
    cardsSuccess: '标签打印页已导出，可直接打印',
    linksSuccess: '二维码链接已导出',
    sheetFailed: '导出二维码图版失败',
    cardsFailed: '导出二维码卡片失败',
    linksFailed: '导出二维码链接失败',
    progressSheet: '正在导出二维码图版',
    progressCards: '正在导出二维码标签',
  },
  startProgress: startQrExportProgress,
  updateProgress: updateQrExportProgress,
  finishProgress: finishQrExportProgress,
});

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

function currentFiltersForList(): PcFilters {
  const filters = currentFilters();
  if (!hasActiveInventoryBatch.value) return { ...filters, inventoryStatus: '' };
  return filters;
}

function buildInventorySummaryFilters(filters: PcFilters = currentFiltersForList()): PcFilters {
  return { ...filters, inventoryStatus: '' };
}

const INVENTORY_BATCH_SOFT_TTL_MS = 15 * 60_000;
const LEDGER_BATCH_REFRESH_DELAY_MS = 12000;
const PC_ASSETS_MUTATION_KEY = 'inventory:pc-assets:mutation';
let lastSeenExternalMutation = 0;

function readPcAssetsMutationTick() {
  try {
    return Number(window.sessionStorage.getItem(PC_ASSETS_MUTATION_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function clearPcAssetsMutationTick() {
  try {
    window.sessionStorage.removeItem(PC_ASSETS_MUTATION_KEY);
  } catch {}
}

function consumeExternalPcAssetsMutation() {
  const externalMutation = readPcAssetsMutationTick();
  if (!externalMutation || externalMutation <= lastSeenExternalMutation) return false;
  lastSeenExternalMutation = externalMutation;
  clearPcAssetsMutationTick();
  invalidatePagedListNamespace('pc-assets');
  invalidateCache();
  invalidateTotal();
  return true;
}

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

let deferredInventoryBatchTimer: number | null = null;

function clearDeferredInventoryBatchTimer() {
  if (deferredInventoryBatchTimer != null && typeof window !== 'undefined') {
    window.clearTimeout(deferredInventoryBatchTimer);
    deferredInventoryBatchTimer = null;
  }
}

function scheduleDeferredInventoryBatchRefresh(task: () => void | Promise<void>) {
  if (typeof window === 'undefined') return;
  clearDeferredInventoryBatchTimer();
  const start = () => {
    deferredInventoryBatchTimer = window.setTimeout(() => {
      deferredInventoryBatchTimer = null;
      runWhenBrowserIdle(task, 6000);
    }, LEDGER_BATCH_REFRESH_DELAY_MS);
  };
  if (document.visibilityState === 'visible') {
    start();
    return;
  }
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', onVisible);
    start();
  };
  document.addEventListener('visibilitychange', onVisible, { passive: true, once: true });
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

async function refreshLedgerData(options: { keepPage?: boolean; silent?: boolean; skipAuxiliary?: boolean; forceRefresh?: boolean } = {}) {
  clearKeywordTimer();
  const filters = currentFiltersForList();
  if (options.keepPage) {
    await load(filters, { keepPage: true, silent: options.silent, forceRefresh: options.forceRefresh });
  } else {
    await reload(filters, { silent: options.silent, forceRefresh: options.forceRefresh });
  }
  lastRefreshAt = Date.now();
  if (!options.skipAuxiliary) scheduleAuxiliaryRefresh(filters);
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
    await confirmLedgerAction({
      title: '初始化二维码Key',
      message: '将把“补齐电脑二维码 Key”提交到异步任务中心后台执行。继续？',
      confirmButtonText: '确认提交',
    });
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

function openAuditHistory(row?: PcAsset | null) {
  const id = Number(row?.id || infoRow.value?.id || 0);
  if (!id) return;
  infoVisible.value = false;
  router.push({ path: '/system/audit', query: { entity: 'pc_assets', entity_id: String(id), module: 'PC' } });
}

async function openQr(row: PcAsset) {
  warmLazyDialog(lazyQrDialog);
  await openAssetQr(row);
}

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
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  await runSaveAction<Record<string, any>>({
    busy: saving,
    buildPayload: () => {
      const form = editForm.value || {};
      return {
        ...form,
        brand: trimText(form.brand),
        model: trimText(form.model),
        serial_no: trimText(form.serial_no),
        manufacture_date: trimText(form.manufacture_date),
        warranty_end: trimText(form.warranty_end),
        disk_capacity: trimText(form.disk_capacity),
        memory_size: trimText(form.memory_size),
        remark: trimText(form.remark),
      };
    },
    validate: (payload) => {
      if (!validateRequiredFields(payload, [
        { key: 'brand', label: '品牌' },
        { key: 'model', label: '型号' },
        { key: 'serial_no', label: '序列号' },
      ])) return false;
      if (payload.manufacture_date && !datePattern.test(payload.manufacture_date)) {
        ElMessage.warning('出厂时间格式需为 YYYY-MM-DD');
        return false;
      }
      if (payload.warranty_end && !datePattern.test(payload.warranty_end)) {
        ElMessage.warning('保修到期格式需为 YYYY-MM-DD');
        return false;
      }
      return true;
    },
    submit: (payload) => {
      editForm.value = { ...payload };
      return apiPut('/api/pc-assets', payload);
    },
    successMessage: '修改成功',
    notificationTitle: '电脑台账已更新',
    notificationMessage: (payload) => `已更新 ${payload.brand} ${payload.model}`.trim() || '电脑记录',
    errorMessage: '修改失败',
    onSuccess: async (payload) => {
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
    },
  });
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
    await confirmLedgerAction({
      title: operation === 'purge' ? '彻底删除预检' : '删除预检',
      message,
      confirmButtonText: operation === 'purge' ? '确认彻底删除' : '确认删除',
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
    showLedgerSuccess({
      message: result?.message || (isArchived ? '彻底删除成功' : '删除成功'),
      notificationTitle: isArchived ? '电脑已彻底删除' : '电脑删除已处理',
      notificationMessage: isArchived ? `已清理 ${label || '电脑记录'}。` : `已处理 ${label || '电脑记录'}，有历史记录的资产会转入归档。`,
      notificationType: isArchived ? 'warning' : 'success',
    });
  } catch (error: any) {
    showLedgerError(error, isArchived ? '彻底删除失败' : '删除失败');
  } finally {
    batchBusy.value = false;
  }
}


async function restoreAsset(row: PcAsset) {
  try {
    await confirmLedgerAction({
      title: '恢复归档',
      message: `确认恢复电脑：${row.brand || ''} ${row.model || ''}（SN: ${row.serial_no || '-'}）？恢复后将重新出现在默认台账列表中。`,
      confirmButtonText: '确认恢复',
    });
    batchBusy.value = true;
    const result: any = await withBlockingActionFeedback('正在恢复电脑归档', () =>
      apiPost('/api/pc-assets-bulk', { action: 'restore', ids: [Number(row.id)] })
    );
    showLedgerSuccess({
      message: result?.message || '恢复成功',
      notificationTitle: '电脑已恢复',
      notificationMessage: `已恢复 ${row.brand || ''} ${row.model || ''}`.trim() || '电脑记录已恢复。',
      notificationType: 'info',
    });
    applyPcRestorePatch(extractAffectedIds(result, [Number(row.id)]));
    clearSelection();
    await ensureLocalPatchedPageStable(true);
  } catch (error: any) {
    showLedgerError(error, '恢复归档失败');
  } finally {
    batchBusy.value = false;
  }
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
  await runBulkAction({
    action: 'status',
    payload: { status: batchStatusValue.value },
    successMessage: '批量修改成功',
    notificationTitle: '批量状态已更新',
    notificationMessage: `已处理 ${selectedCount.value} 台电脑的状态。`,
    errorMessage: '批量修改状态失败',
    closeDialog: () => { batchStatusVisible.value = false; },
    applyResult: (result) => applyPcStatusPatch(extractAffectedIds(result), batchStatusValue.value),
  });
}


async function submitBatchOwner() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  if (!String(batchOwnerForm.value.employee_name || '').trim()) return ElMessage.warning('请输入领用人');
  await runBulkAction({
    action: 'owner',
    payload: {
      employee_name: batchOwnerForm.value.employee_name,
      employee_no: batchOwnerForm.value.employee_no,
      department: batchOwnerForm.value.department,
    },
    successMessage: '批量修改领用人成功',
    notificationTitle: '批量领用人已更新',
    notificationMessage: `已处理 ${selectedCount.value} 台电脑的领用信息。`,
    errorMessage: '批量修改领用人失败',
    closeDialog: () => { batchOwnerVisible.value = false; },
    applyResult: (result) => applyPcOwnerPatch(extractAffectedIds(result), batchOwnerForm.value),
  });
}

async function batchRestoreSelected() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  const restorable = selectionSummary.value.archived;
  if (!restorable) return ElMessage.warning('当前选中项中没有已归档电脑');
  try {
    await confirmBatchRisk('批量恢复归档', `预计恢复 ${restorable} 台电脑。恢复后将重新出现在默认台账列表中，请输入“确认”继续。`);
  } catch {
    return;
  }
  await runBulkAction({
    action: 'restore',
    requestLabel: '正在批量恢复电脑归档',
    successMessage: '批量恢复成功',
    notificationTitle: '批量恢复完成',
    notificationMessage: `已恢复 ${selectedCount.value} 台电脑。`,
    notificationType: 'info',
    errorMessage: '批量恢复归档失败',
    stable: true,
    applyResult: (result) => applyPcRestorePatch(extractAffectedIds(result)),
  });
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
    notificationTitle: '批量归档完成',
    notificationMessage: `已归档 ${selectedCount.value} 台电脑。`,
    notificationType: 'warning',
    errorMessage: '批量归档失败',
    closeDialog: () => { batchArchiveVisible.value = false; },
    stable: true,
    applyResult: (result) => applyPcArchivePatch(extractAffectedIds(result), batchArchiveForm.value),
  });
}

async function batchDeleteSelected() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  await runBulkDelete({
    requestLabel: '正在批量删除电脑台账',
    errorMessage: '批量删除失败',
    applyDeletePatch: applyPcDeletePatch,
  });
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








async function hydrateViewData(options: { keepPage?: boolean; silent?: boolean; skipAuxiliary?: boolean; forceRefresh?: boolean } = {}) {
  const shouldRefreshBatch = Number(inventoryBatchLoadedAt.value || 0) <= 0 || (Date.now() - Number(inventoryBatchLoadedAt.value || 0)) >= INVENTORY_BATCH_SOFT_TTL_MS;
  await refreshLedgerData(options);
  if (!shouldRefreshBatch) return;
  scheduleDeferredInventoryBatchRefresh(async () => {
    try {
      await refreshInventoryBatch();
      const nextFilters = currentFiltersForList();
      if (shouldLoadInventorySummary(nextFilters)) void refreshInventorySummary(nextFilters);
    } catch {}
  });
}

function handleViewportResize() {
  isMobile.value = typeof window !== 'undefined' ? isLedgerMobileViewport() : false;
}

onBeforeMount(() => {
  const hasExternalMutation = consumeExternalPcAssetsMutation();
  const defaultView = getDefaultSavedView();
  if (defaultView) {
    runWithoutAutoSearch(() => {
      applySavedView(defaultView.name);
    });
  }
  handleViewportResize();
  if (typeof window !== 'undefined') window.addEventListener('resize', handleViewportResize, { passive: true });
  void hydrateViewData({ skipAuxiliary: true, keepPage: !hasExternalMutation, forceRefresh: hasExternalMutation }).finally(() => {
    const filters = currentFiltersForList();
    scheduleAuxiliaryRefresh(filters);
  });
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', handleViewportResize);
  clearDeferredInventoryBatchTimer();
  cleanupViewState();
});

onActivated(() => {
  if (consumeExternalPcAssetsMutation()) {
    void hydrateViewData({ keepPage: false, silent: false, forceRefresh: true });
    return;
  }
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

  :deep(.ledger-toolbar-card > .el-card__body),
  :deep(.ledger-table-card > .el-card__body) {
    padding: 14px;
  }
}
</style>
