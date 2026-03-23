<template>
  <el-card class="asset-page-card">
    <PcAssetsToolbar
      v-model:status="status"
      v-model:keyword="keyword"
      v-model:archive-reason="archiveReason"
      v-model:archive-mode="archiveMode"
      v-model:show-archived="showArchived"
      :is-admin="isAdmin"
      :can-operator="canOperator"
      :visible-columns="visibleColumns"
      :column-order="columnOrder"
      :column-options="pcColumnOptions"
      :selected-count="selectedCount"
      :export-busy="exportBusy"
      :import-busy="importBusy"
      :init-qr-busy="initQrBusy"
      :batch-busy="batchBusy"
      :archive-reason-options="archiveReasonOptions"
      @update:visible-columns="updateVisibleColumns"
      @move-column="moveVisibleColumn"
      @search="onSearch"
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
      @restore-columns="restoreDefaultColumns"
      @init-qr="initQrKeys"
      @download-template="downloadAssetTemplate"
      @import-file="onImportAssetsFile"
    />

    <PcAssetsTable
      :rows="rows"
      :loading="loading"
      :page="page"
      :page-size="pageSize"
      :total="total"
      :can-operator="canOperator"
      :is-admin="isAdmin"
      :visible-columns="visibleColumns"
      :column-widths="columnWidths"
      :selected-ids="selectedIds"
      @open-info="openInfo"
      @open-edit="openEdit"
      @open-qr="openQr"
      @remove="removeAsset"
      @restore="restoreAsset"
      @selection-change="onSelectionChange"
      @column-resize="updateColumnWidth"
      @page-change="(value) => onPageChange(currentFilters(), value)"
      @page-size-change="(value) => onPageSizeChange(currentFilters(), value)"
    />


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
      :department-options="departmentOptions"
      @submit="submitBatchOwner"
    />
    <PcAssetBatchArchiveDialog
      v-if="lazyBatchArchiveDialog"
      v-model:visible="batchArchiveVisible"
      :loading="batchBusy"
      :form="batchArchiveForm"
      :preview="batchArchivePreview"
      :archive-reason-options="archiveReasonOptions"
      @submit="submitBatchArchive"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, onActivated, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from "../utils/el-services";
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import { listPcAssets } from '../api/assetLedgers';
import { fetchBulkPcAssetQrLinks } from '../api/assetQr';
import { getCachedAssetQr, invalidateAssetQr, setCachedAssetQr } from '../utils/assetQrCache';
import { useAssetLedgerPage } from '../composables/useAssetLedgerPage';
import { useCrossPageSelection } from '../composables/useCrossPageSelection';
import type { PcAsset, PcFilters } from '../types/assets';
import { assetStatusText } from '../types/assets';
import { formatBeijingDateTime } from '../utils/datetime';
import { readJsonStorage, writeJsonStorage } from '../utils/storage';
import { getCachedSystemSettings } from '../api/systemSettings';
import { moveColumnKey, normalizeColumnOrder, normalizeColumnWidths, normalizeVisibleColumns, orderVisibleColumns, setColumnWidth } from '../utils/tableColumns';
import { createIdleDebounced } from '../utils/idleDebounce';
import { can } from '../store/auth';
import PcAssetsToolbar from '../components/assets/PcAssetsToolbar.vue';
import PcAssetsTable from '../components/assets/PcAssetsTable.vue';

const PcAssetEditDialog = defineAsyncComponent(() => import('../components/assets/PcAssetEditDialog.vue'));
const PcAssetInfoDialog = defineAsyncComponent(() => import('../components/assets/PcAssetInfoDialog.vue'));
const PcAssetQrDialog = defineAsyncComponent(() => import('../components/assets/PcAssetQrDialog.vue'));
const PcAssetBatchStatusDialog = defineAsyncComponent(() => import('../components/assets/PcAssetBatchStatusDialog.vue'));
const PcAssetBatchOwnerDialog = defineAsyncComponent(() => import('../components/assets/PcAssetBatchOwnerDialog.vue'));
const PcAssetBatchArchiveDialog = defineAsyncComponent(() => import('../components/assets/PcAssetBatchArchiveDialog.vue'));

const STORAGE_KEY = 'inventory:pc-assets:filters';
const PC_COLUMN_OPTIONS = [
  { value: 'computer', label: '电脑' },
  { value: 'config', label: '配置' },
  { value: 'status', label: '状态' },
  { value: 'owner', label: '当前领用人' },
  { value: 'configDate', label: '配置日期' },
  { value: 'recycleDate', label: '回收日期' },
  { value: 'remark', label: '备注' },
] as const;
const PC_COLUMN_KEYS = PC_COLUMN_OPTIONS.map((item) => item.value);
const persistedState = readJsonStorage(STORAGE_KEY, { status: '', keyword: '', archiveReason: '', archiveMode: 'active', showArchived: false, pageSize: getCachedSystemSettings().ui_default_page_size, visibleColumns: PC_COLUMN_KEYS, columnOrder: PC_COLUMN_KEYS, columnWidths: {} as Record<string, number> });

const status = ref(String(persistedState.status || ''));
const keyword = ref(String(persistedState.keyword || ''));
const archiveReason = ref(String((persistedState as any).archiveReason || ''));
const archiveMode = ref(((persistedState as any).archiveMode || (persistedState.showArchived ? 'all' : 'active')) as 'active' | 'archived' | 'all');
const showArchived = ref(Boolean(persistedState.showArchived || archiveMode.value !== 'active'));
const columnOrder = ref(normalizeColumnOrder(persistedState.columnOrder, PC_COLUMN_KEYS));
const visibleColumns = ref(orderVisibleColumns(normalizeVisibleColumns(persistedState.visibleColumns, PC_COLUMN_KEYS), columnOrder.value));
const columnWidths = ref(normalizeColumnWidths(persistedState.columnWidths, PC_COLUMN_KEYS));
const canOperator = computed(() => can('operator'));
const isAdmin = computed(() => can('admin'));
const router = useRouter();
const systemSettings = ref(getCachedSystemSettings());
const archiveReasonOptions = computed(() => systemSettings.value.asset_archive_reason_options || []);
const departmentOptions = computed(() => systemSettings.value.dictionary_department_options || []);
const pcBrandOptions = computed(() => systemSettings.value.dictionary_pc_brand_options || []);

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


const currentFilters = (): PcFilters => ({
  status: status.value || '',
  keyword: keyword.value || '',
  archiveReason: archiveMode.value !== 'active' ? (archiveReason.value || '') : '',
  archiveMode: archiveMode.value,
  showArchived: Boolean(showArchived.value || archiveMode.value !== 'active'),
});

const { rows, loading, page, pageSize, total, load, reload, onPageChange, onPageSizeChange, fetchAll, invalidateTotal } = useAssetLedgerPage<PcFilters, PcAsset>({
  createFilterKey: (filters) => `status=${filters.status}&keyword=${filters.keyword}&archive=${filters.archiveReason || ''}&archived=${filters.showArchived ? 1 : 0}&archiveMode=${filters.archiveMode}`,
  fetchPage: (filters, currentPage, currentPageSize, _fast, signal) => listPcAssets(filters, currentPage, currentPageSize, false, signal),
});

pageSize.value = Number(persistedState.pageSize || pageSize.value || getCachedSystemSettings().ui_default_page_size || 50);
const SOFT_REFRESH_TTL_MS = 15_000;
let lastRefreshAt = 0;


async function refreshCurrent(keepPage = true, resetTotal = false) {
  if (resetTotal) invalidateTotal();
  await load(currentFilters(), { keepPage });
  lastRefreshAt = Date.now();
}

const pcColumnOptions = [...PC_COLUMN_OPTIONS];
const exportBusy = ref(false);
const importBusy = ref(false);
const initQrBusy = ref(false);
const batchBusy = ref(false);
const batchStatusVisible = ref(false);
const batchStatusValue = ref('IN_STOCK');
const batchOwnerVisible = ref(false);
const batchOwnerForm = ref({ employee_name: '', employee_no: '', department: '' });
const batchArchiveVisible = ref(false);
const batchArchiveForm = ref({ reason: '停用归档', note: '' });

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

function persistState() {
  writeJsonStorage(STORAGE_KEY, {
    status: status.value || '',
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

watch([status, keyword, archiveReason, archiveMode, showArchived, pageSize, visibleColumns, columnOrder, columnWidths], () => schedulePersistState());
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
const qrLink = ref('');
const qrRow = ref<PcAsset | null>(null);

function pcQrVersionOf(row?: Partial<PcAsset> | null) {
  return String(row?.qr_updated_at || row?.updated_at || '');
}

function updateVisibleColumns(value: string[]) {
  visibleColumns.value = orderVisibleColumns(normalizeVisibleColumns(value, PC_COLUMN_KEYS), columnOrder.value);
}

function restoreDefaultColumns() {
  columnOrder.value = [...PC_COLUMN_KEYS];
  visibleColumns.value = [...PC_COLUMN_KEYS];
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

const onSearch = () => {
  clearKeywordTimer();
  reload(currentFilters());
};
const reset = () => {
  suppressAutoSearch = true;
  status.value = '';
  keyword.value = '';
  showArchived.value = false;
  archiveMode.value = 'active';
  archiveReason.value = '';
  suppressAutoSearch = false;
  clearKeywordTimer();
  reload(currentFilters());
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


async function exportSelectedQrPngLocal() {
  const qrLinks = await fetchBulkPcAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
  const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
  const records: Array<{ title: string; subtitle?: string; meta: Array<{ label: string; value: string }>; url: string }> = [];
  for (const row of selectedRows.value) {
    const link = qrLinkMap.get(Number(row.id)) || '';
    if (!link) continue;
    records.push({
      title: [row.brand, row.model].filter(Boolean).join(' · ') || `电脑 #${row.id}`,
      subtitle: `SN：${row.serial_no || '-'} · 状态：${assetStatusText(row.status)}`,
      meta: [
        { label: '领用人', value: row.last_employee_name || '-' },
        { label: '工号', value: row.last_employee_no || '-' },
        { label: '部门', value: row.last_department || '-' },
        { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
      ],
      url: link,
    });
  }
  if (!records.length) return ElMessage.warning('当前选中项没有可导出的二维码');
  const { downloadQrCardsPng } = await loadQrCardUtils();
  await downloadQrCardsPng(`电脑二维码图版_${records.length}条`, '电脑二维码图版', records);
  ElMessage.success('二维码图版(PNG)已导出');
}

async function exportSelectedQrCardsLocal() {
  const qrLinks = await fetchBulkPcAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
  const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
  const records = [] as Array<{ title: string; subtitle: string; meta: Array<{ label: string; value: string }>; url: string }>;
  for (const row of selectedRows.value) {
    const url = qrLinkMap.get(Number(row.id)) || '';
    if (!url) continue;
    records.push({
      title: `${row.brand || '-'} ${row.model || ''}`.trim(),
      subtitle: `SN：${row.serial_no || '-'}`,
      meta: [
        { label: '状态', value: assetStatusText(row.status) },
        { label: '序列号', value: row.serial_no || '-' },
        { label: '领用人', value: row.last_employee_name || '-' },
      ],
      url,
    });
  }
  if (!records.length) return ElMessage.warning('当前选中项没有可导出的二维码');
  const { downloadQrCardsHtml } = await loadQrCardUtils();
  await downloadQrCardsHtml(`电脑二维码卡片_${records.length}条`, '电脑二维码卡片', records);
  ElMessage.success('二维码卡片已导出，可直接打印');
}
async function exportSelectedQrPng() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  try {
    exportBusy.value = true;
    if (!isAdmin.value) {
      await exportSelectedQrPngLocal();
      return;
    }
    const ids = selectedRows.value.map((row) => Number(row.id));
    const result: any = await apiPost('/api/jobs', { job_type: 'PC_QR_SHEET_EXPORT', request_json: { ids, origin: window.location.origin }, retain_days: 7, max_retries: 1 });
    const jobId = Number(result?.data?.id || result?.id || 0);
    ElMessage.success(jobId ? `任务已创建（#${jobId}），可在“系统工具 / 异步任务”下载二维码图版（SVG）` : '任务已创建，可在“系统工具 / 异步任务”下载二维码图版（SVG）');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码图版失败');
  } finally {
    exportBusy.value = false;
  }
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
  qrLink.value = '';
  try {
    const id = Number(row?.id || 0);
    if (!id) throw new Error('缺少资产ID');
    const version = pcQrVersionOf(row);
    const cached = getCachedAssetQr('pc', id, version);
    if (cached) {
      qrLink.value = cached.link;
      qrDataUrl.value = cached.dataUrl;
      return;
    }
    const result: any = await apiGet(`/api/pc-asset-qr-token?id=${encodeURIComponent(String(id))}`);
    const link = String(result?.url || '');
    if (!link) throw new Error('二维码链接生成失败');
    qrLink.value = link;
    const QRCode = await loadQrCodeLib();
    const dataUrl = await QRCode.toDataURL(link, { width: 260, margin: 3, errorCorrectionLevel: 'Q' });
    qrDataUrl.value = dataUrl;
    setCachedAssetQr('pc', id, version, { link, dataUrl });
  } catch (error: any) {
    ElMessage.error(error?.message || '生成二维码失败');
    qrVisible.value = false;
  } finally {
    qrLoading.value = false;
  }
}

async function resetQr() {
  try {
    if (!qrRow.value?.id) return;
    await ElMessageBox.confirm('确认要重置该电脑的二维码吗？重置后旧二维码将立即失效。', '重置二维码', { type: 'warning' });
    qrLoading.value = true;
    const assetId = Number(qrRow.value.id);
    invalidateAssetQr('pc', assetId);
    const result: any = await apiPost(`/api/pc-assets-reset-qr?id=${encodeURIComponent(String(assetId))}`, {});
    const link = String(result?.url || '');
    qrLink.value = link;
    const QRCode = await loadQrCodeLib();
    const dataUrl = await QRCode.toDataURL(link, { width: 260, margin: 3, errorCorrectionLevel: 'Q' });
    qrDataUrl.value = dataUrl;
    const version = new Date().toISOString();
    qrRow.value = qrRow.value ? { ...qrRow.value, qr_updated_at: version } : qrRow.value;
    setCachedAssetQr('pc', assetId, version, { link, dataUrl });
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

function mmToPx(mm: number, dpi = 300) {
  return Math.round((mm / 25.4) * dpi);
}

async function downloadLabel() {
  if (!qrLink.value) return;
  const row = qrRow.value || {};
  const title = `${row.brand || ''} ${row.model || ''}`.trim() || '电脑信息';
  const sn = (row.serial_no || row.id || '').toString();
  const width = mmToPx(50);
  const height = mmToPx(30);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);

  const pad = Math.round(width * 0.04);
  const topHeight = Math.round(height * 0.22);
  const bottomHeight = Math.round(height * 0.18);
  context.fillStyle = '#111';
  context.textBaseline = 'middle';
  context.font = `bold ${Math.round(height * 0.12)}px sans-serif`;
  const maxTitleWidth = width - pad * 2;
  let text = title;
  while (context.measureText(text).width > maxTitleWidth && text.length > 6) text = text.slice(0, -1);
  if (text !== title) text += '…';
  context.fillText(text, pad, Math.round(topHeight / 2));

  const qrAreaTop = topHeight;
  const qrAreaHeight = height - topHeight - bottomHeight;
  const qrSize = Math.min(qrAreaHeight, Math.round(width * 0.52));
  const qrX = Math.round((width - qrSize) / 2);
  const qrY = qrAreaTop + Math.round((qrAreaHeight - qrSize) / 2);

  const QRCode = await loadQrCodeLib();

  QRCode.toDataURL(qrLink.value, { width: qrSize, margin: 3, errorCorrectionLevel: 'Q' })
    .then((dataUrl: string) => {
      const image = new Image();
      image.onload = () => {
        context.drawImage(image, qrX, qrY, qrSize, qrSize);
        context.fillStyle = '#111';
        context.font = `${Math.round(height * 0.11)}px monospace`;
        const bottomY = height - Math.round(bottomHeight / 2);
        const snText = sn ? `SN: ${sn}` : '';
        const textWidth = context.measureText(snText).width;
        context.fillText(snText, Math.max(pad, Math.round((width - textWidth) / 2)), bottomY);
        const link = document.createElement('a');
        const filename = (sn || row.id || 'pc').toString();
        link.download = `PC_${filename}_标签_50x30mm.png`;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        link.remove();
      };
      image.src = dataUrl;
    })
    .catch(() => ElMessage.error('生成标签失败'));
}

function downloadQr() {
  if (!qrDataUrl.value) return;
  const link = document.createElement('a');
  const sn = (qrRow.value?.serial_no || qrRow.value?.id || 'pc').toString();
  link.download = `PC_${sn}_二维码.png`;
  link.href = qrDataUrl.value;
  document.body.appendChild(link);
  link.click();
  link.remove();
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
  if (!String(form.brand || '').trim()) return ElMessage.warning('品牌必填');
  if (!String(form.model || '').trim()) return ElMessage.warning('型号必填');
  if (!String(form.serial_no || '').trim()) return ElMessage.warning('序列号必填');

  try {
    saving.value = true;
    await apiPut('/api/pc-assets', form);
    ElMessage.success('修改成功');
    editVisible.value = false;
    await refreshCurrent(true, true);
  } catch (error: any) {
    ElMessage.error(error?.message || '修改失败');
  } finally {
    saving.value = false;
  }
}

async function removeAsset(row: PcAsset) {
  const isArchived = Number(row.archived || 0) === 1;
  try {
    const preview: any = await apiDelete('/api/pc-assets', { id: row.id, preview_only: true });
    const operation = String(preview?.data?.operation || (isArchived ? 'purge' : 'delete'));
    const relatedTotal = Number(preview?.data?.related_total || 0);
    const reason = String(preview?.data?.reason || '');
    const message = operation === 'purge'
      ? `确认彻底删除归档电脑：${row.brand || ''} ${row.model || ''}（SN: ${row.serial_no || '-'}）？本次将清理 ${relatedTotal} 条关联记录。${reason}`
      : operation === 'archive'
        ? `确认删除电脑台账：${row.brand || ''} ${row.model || ''}（SN: ${row.serial_no || '-'}）？预检结果：本次不会物理删除，而会自动归档。${reason}`
        : `确认删除电脑台账：${row.brand || ''} ${row.model || ''}（SN: ${row.serial_no || '-'}）？预检结果：满足物理删除条件。`;
    await ElMessageBox.confirm(message, operation === 'purge' ? '彻底删除预检' : '删除预检', {
      type: 'warning',
      confirmButtonText: operation === 'purge' ? '确认彻底删除' : '确认删除',
      cancelButtonText: '取消',
    });
    loading.value = true;
    const result: any = await apiDelete('/api/pc-assets', { id: row.id });
    ElMessage.success(result?.message || (isArchived ? '彻底删除成功' : '删除成功'));
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await refreshCurrent(true, true);
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || (isArchived ? '彻底删除失败' : '删除失败'));
  } finally {
    loading.value = false;
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
    clearSelection();
    await refreshCurrent(true, true);
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
    const { exportToXlsx } = await loadExcelUtils();
    const qrLinks = await fetchBulkPcAssetQrLinks(selectedRows.value.map((row) => Number(row.id)));
    const qrLinkMap = new Map<number, string>(qrLinks.map((item: { id: number; url: string }) => [item.id, item.url] as [number, string]));
    const linkRows = [];
    for (const row of selectedRows.value) {
      linkRows.push({
        id: row.id,
        brand: row.brand,
        model: row.model,
        serial_no: row.serial_no,
        status: assetStatusText(row.status),
        url: qrLinkMap.get(Number(row.id)) || '',
      });
    }
    exportToXlsx({
      filename: `电脑二维码链接_${selectedCount.value}条.xlsx`,
      sheetName: '二维码链接',
      headers: [
        { key: 'id', title: 'ID' },
        { key: 'brand', title: '品牌' },
        { key: 'model', title: '型号' },
        { key: 'serial_no', title: '序列号' },
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

async function exportSelectedQrCards() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  try {
    exportBusy.value = true;
    if (!isAdmin.value) {
      await exportSelectedQrCardsLocal();
      return;
    }
    const ids = selectedRows.value.map((row) => Number(row.id));
    const result: any = await apiPost('/api/jobs', { job_type: 'PC_QR_CARDS_EXPORT', request_json: { ids, origin: window.location.origin }, retain_days: 7, max_retries: 1 });
    const jobId = Number(result?.data?.id || result?.id || 0);
    ElMessage.success(jobId ? `任务已创建（#${jobId}），可在“系统工具 / 异步任务”下载二维码卡片` : '任务已创建，可在“系统工具 / 异步任务”下载二维码卡片');
  } catch (error: any) {
    ElMessage.error(error?.message || '导出二维码卡片失败');
  } finally {
    exportBusy.value = false;
  }
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
    batchStatusVisible.value = false;
    clearSelection();
    await refreshCurrent(true, true);
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
    batchOwnerVisible.value = false;
    clearSelection();
    await refreshCurrent(true, true);
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
    clearSelection();
    await refreshCurrent(true, true);
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || '批量恢复归档失败');
  } finally {
    batchBusy.value = false;
  }
}

async function batchArchiveSelected() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  batchArchiveForm.value = { reason: archiveReasonOptions.value[0] || '停用归档', note: '' };
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
    batchArchiveVisible.value = false;
    clearSelection();
    await refreshCurrent(true, true);
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
    const activeCount = Math.max(0, selectedCount.value - archivedCount);
    const tip = archivedCount && activeCount
      ? `选中的 ${selectedCount.value} 台电脑中，已归档的 ${archivedCount} 台会被彻底删除并清理历史记录，其余 ${activeCount} 台仍按原规则执行：有历史记录则自动归档，满足条件才物理删除。请输入“确认”继续。`
      : archivedCount
        ? `选中的 ${archivedCount} 台归档电脑会被彻底删除，并同时清理关联历史记录。请输入“确认”继续。`
        : `选中的 ${selectedCount.value} 台电脑中，有历史记录的资产会自动转归档，只有满足条件的资产会物理删除。请输入“确认”继续。`;
    await confirmBatchRisk('批量删除确认', tip);
    batchBusy.value = true;
    const result: any = await apiPost('/api/pc-assets-bulk', {
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
    if (processed && !failed) ElMessage.success(archived || purged ? `已处理 ${processed} 台电脑（其中归档 ${archived} 台，彻底删除 ${purged} 台，物理删除 ${deleted} 台）` : `已删除 ${deleted} 台电脑`);
    else if (processed || failed) ElMessage.warning(`已处理 ${processed} 台，失败 ${failed} 台${archived ? `，其中归档 ${archived} 台` : ''}${purged ? `，彻底删除 ${purged} 台` : ''}${deleted ? `，物理删除 ${deleted} 台` : ''}`);
    if (failedRecords.length) await exportBatchFailures(`电脑批量删除失败明细_${failedRecords.length}条.xlsx`, failedRecords);
    await refreshCurrent(true, true);
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
    const { exportToXlsx } = await loadExcelUtils();
    exportToXlsx({
      filename: `电脑台账_已选_${selectedCount.value}条.xlsx`,
      sheetName: '已选台账',
      headers: [
        { key: 'id', title: 'ID' },
        { key: 'status', title: '状态' },
        { key: 'brand', title: '品牌' },
        { key: 'serial_no', title: '序列号' },
        { key: 'model', title: '型号' },
        { key: 'manufacture_date', title: '出厂时间' },
        { key: 'warranty_end', title: '保修到期' },
        { key: 'disk_capacity', title: '硬盘容量' },
        { key: 'memory_size', title: '内存大小' },
        { key: 'remark', title: '备注' },
        { key: 'created_at', title: '创建时间' },
        { key: 'updated_at', title: '更新时间' },
      ],
      rows: selectedRows.value.map((row) => ({
        ...row,
        status: assetStatusText(row.status),
        created_at: formatBeijingDateTime(row.created_at),
        updated_at: formatBeijingDateTime(row.updated_at),
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
      filename: '电脑台账_仓库2.xlsx',
      sheetName: '台账',
      headers: [
        { key: 'id', title: 'ID' },
        { key: 'status', title: '状态' },
        { key: 'brand', title: '品牌' },
        { key: 'serial_no', title: '序列号' },
        { key: 'model', title: '型号' },
        { key: 'manufacture_date', title: '出厂时间' },
        { key: 'warranty_end', title: '保修到期' },
        { key: 'disk_capacity', title: '硬盘容量' },
        { key: 'memory_size', title: '内存大小' },
        { key: 'remark', title: '备注' },
        { key: 'created_at', title: '创建时间' },
        { key: 'updated_at', title: '更新时间' },
      ],
      rows: all.map((row) => ({
        ...row,
        status: assetStatusText(row.status),
        created_at: formatBeijingDateTime(row.created_at),
        updated_at: formatBeijingDateTime(row.updated_at),
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
    if (!rowsToExport.length) return ElMessage.warning('当前没有可导出的归档电脑记录');
    const { exportToXlsx } = await loadExcelUtils();
    exportToXlsx({
      filename: `电脑归档记录_${rowsToExport.length}条.xlsx`,
      sheetName: '电脑归档',
      headers: [
        { key: 'id', title: 'ID' },
        { key: 'status', title: '状态' },
        { key: 'brand', title: '品牌' },
        { key: 'serial_no', title: '序列号' },
        { key: 'model', title: '型号' },
        { key: 'archived_reason', title: '归档原因' },
        { key: 'archived_note', title: '归档备注' },
        { key: 'archived_by', title: '归档人' },
        { key: 'archived_at', title: '归档时间' },
      ],
      rows: rowsToExport.map((row) => ({
        ...row,
        status: assetStatusText(row.status),
        archived_at: formatBeijingDateTime(row.archived_at),
      })),
    });
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

onMounted(async () => {
  persistState();
  await load(currentFilters());
  lastRefreshAt = Date.now();
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
.asset-page-card {
  border-radius: 18px;
}
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
