<template>
  <el-card class="asset-page-card">
    <PcAssetsToolbar
      v-model:status="status"
      v-model:keyword="keyword"
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
      @update:visible-columns="updateVisibleColumns"
      @move-column="moveVisibleColumn"
      @search="onSearch"
      @reset="reset"
      @export="exportExcel"
      @export-selected="exportSelectedRows"
      @clear-selection="clearSelection"
      @export-selected-qr="exportSelectedQrLinks"
      @batch-delete="batchDeleteSelected"
      @batch-status="openBatchStatusDialog"
      @batch-archive="batchArchiveSelected"
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
      @selection-change="onSelectionChange"
      @column-resize="updateColumnWidth"
      @page-change="(value) => onPageChange(currentFilters(), value)"
      @page-size-change="(value) => onPageSizeChange(currentFilters(), value)"
    />

    <PcAssetEditDialog
      v-model:visible="editVisible"
      :form="editForm"
      :saving="saving"
      @save="saveEdit"
    />
    <PcAssetInfoDialog
      v-model:visible="infoVisible"
      :row="infoRow"
    />
    <PcAssetQrDialog
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

    <el-dialog
      v-model="batchStatusVisible"
      title="批量修改电脑状态"
      width="420px"
    >
      <el-form label-width="90px">
        <el-form-item label="目标状态">
          <el-select v-model="batchStatusValue" style="width:100%">
            <el-option label="在库" value="IN_STOCK" />
            <el-option label="已回收" value="RECYCLED" />
            <el-option label="已报废" value="SCRAPPED" />
          </el-select>
        </el-form-item>
        <div class="batch-help">将对当前已选 {{ selectedCount }} 台电脑生效。</div>
      </el-form>
      <template #footer>
        <el-button @click="batchStatusVisible=false">取消</el-button>
        <el-button type="primary" :loading="batchBusy" @click="submitBatchStatus">确认</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import QRCode from 'qrcode';
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import { countPcAssets, listPcAssets } from '../api/assetLedgers';
import { useAssetLedgerPage } from '../composables/useAssetLedgerPage';
import { useCrossPageSelection } from '../composables/useCrossPageSelection';
import type { PcAsset, PcFilters } from '../types/assets';
import { assetStatusText } from '../types/assets';
import { downloadTemplate, exportToXlsx, parseXlsx } from '../utils/excel';
import { formatBeijingDateTime } from '../utils/datetime';
import { readJsonStorage, writeJsonStorage } from '../utils/storage';
import { moveColumnKey, normalizeColumnOrder, normalizeColumnWidths, normalizeVisibleColumns, orderVisibleColumns, setColumnWidth } from '../utils/tableColumns';
import { can } from '../store/auth';
import PcAssetsToolbar from '../components/assets/PcAssetsToolbar.vue';
import PcAssetsTable from '../components/assets/PcAssetsTable.vue';
import PcAssetEditDialog from '../components/assets/PcAssetEditDialog.vue';
import PcAssetInfoDialog from '../components/assets/PcAssetInfoDialog.vue';
import PcAssetQrDialog from '../components/assets/PcAssetQrDialog.vue';

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
const persistedState = readJsonStorage(STORAGE_KEY, { status: '', keyword: '', pageSize: 50, visibleColumns: PC_COLUMN_KEYS, columnOrder: PC_COLUMN_KEYS, columnWidths: {} as Record<string, number> });

const status = ref(String(persistedState.status || ''));
const keyword = ref(String(persistedState.keyword || ''));
const columnOrder = ref(normalizeColumnOrder(persistedState.columnOrder, PC_COLUMN_KEYS));
const visibleColumns = ref(orderVisibleColumns(normalizeVisibleColumns(persistedState.visibleColumns, PC_COLUMN_KEYS), columnOrder.value));
const columnWidths = ref(normalizeColumnWidths(persistedState.columnWidths, PC_COLUMN_KEYS));
const canOperator = computed(() => can('operator'));
const isAdmin = computed(() => can('admin'));

const currentFilters = (): PcFilters => ({
  status: status.value || '',
  keyword: keyword.value || '',
});

const { rows, loading, page, pageSize, total, load, reload, onPageChange, onPageSizeChange, fetchAll } = useAssetLedgerPage<PcFilters, PcAsset>({
  createFilterKey: (filters) => `status=${filters.status}&keyword=${filters.keyword}`,
  fetchPage: (filters, currentPage, currentPageSize, fast, signal) => listPcAssets(filters, currentPage, currentPageSize, fast, signal),
  fetchTotal: (filters, signal) => countPcAssets(filters, signal),
});

pageSize.value = Number(persistedState.pageSize || pageSize.value || 50);

const pcColumnOptions = [...PC_COLUMN_OPTIONS];
const exportBusy = ref(false);
const importBusy = ref(false);
const initQrBusy = ref(false);
const batchBusy = ref(false);
const batchStatusVisible = ref(false);
const batchStatusValue = ref('IN_STOCK');

const { selectedIds, selectedRows, selectedCount, syncPageSelection, clearSelection } = useCrossPageSelection<PcAsset>((row) => String(row.id));

function persistState() {
  writeJsonStorage(STORAGE_KEY, {
    status: status.value || '',
    keyword: keyword.value || '',
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

watch([status, keyword, pageSize, visibleColumns, columnOrder, columnWidths], persistState);
watch(keyword, (_value, oldValue) => {
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
  suppressAutoSearch = false;
  clearKeywordTimer();
  reload(currentFilters());
};

async function initQrKeys() {
  if (initQrBusy.value) return;
  try {
    await ElMessageBox.confirm('将为所有缺少二维码Key的电脑批量生成Key（分批执行）。继续？', '初始化二维码Key', { type: 'warning' });
    initQrBusy.value = true;
    let totalUpdated = 0;
    for (let i = 0; i < 20; i += 1) {
      const result: any = await apiPost('/api/pc-assets-init-qr-keys?batch=200', {});
      const updated = Number(result?.updated || 0);
      totalUpdated += updated;
      if (!updated) break;
    }
    ElMessage.success(totalUpdated ? `已补齐 ${totalUpdated} 台电脑的二维码Key` : '无需补齐（都已存在）');
  } catch (error: any) {
    if (error?.message) ElMessage.error(error.message);
  } finally {
    initQrBusy.value = false;
  }
}

async function openQr(row: PcAsset) {
  qrRow.value = row;
  qrVisible.value = true;
  qrLoading.value = true;
  qrDataUrl.value = '';
  qrLink.value = '';
  try {
    const result: any = await apiGet(`/api/pc-asset-qr-token?id=${encodeURIComponent(String(row.id))}`);
    qrLink.value = result.url;
    qrDataUrl.value = await QRCode.toDataURL(result.url, { width: 260, margin: 3, errorCorrectionLevel: 'Q' });
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
    const result: any = await apiPost(`/api/pc-assets-reset-qr?id=${encodeURIComponent(String(qrRow.value.id))}`, {});
    qrLink.value = result.url;
    qrDataUrl.value = await QRCode.toDataURL(result.url, { width: 260, margin: 3, errorCorrectionLevel: 'Q' });
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

function downloadLabel() {
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
  editVisible.value = true;
}

function openInfo(row: PcAsset) {
  infoRow.value = { ...row };
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
    await load(currentFilters(), { keepPage: true });
  } catch (error: any) {
    ElMessage.error(error?.message || '修改失败');
  } finally {
    saving.value = false;
  }
}

async function removeAsset(row: PcAsset) {
  try {
    await ElMessageBox.confirm(`确认删除电脑台账：${row.brand || ''} ${row.model || ''}（SN: ${row.serial_no || '-'}）？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });
    loading.value = true;
    const result: any = await apiDelete('/api/pc-assets', { id: row.id });
    ElMessage.success(result?.message || '删除成功');
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load(currentFilters(), { keepPage: true });
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || '删除失败');
  } finally {
    loading.value = false;
  }
}

async function exportSelectedQrLinks() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  try {
    batchBusy.value = true;
    const linkRows = [];
    for (const row of selectedRows.value) {
      const result: any = await apiGet(`/api/pc-asset-qr-token?id=${encodeURIComponent(String(row.id))}`);
      linkRows.push({
        id: row.id,
        brand: row.brand,
        model: row.model,
        serial_no: row.serial_no,
        status: assetStatusText(row.status),
        url: result?.url || '',
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


function openBatchStatusDialog() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  batchStatusValue.value = 'IN_STOCK';
  batchStatusVisible.value = true;
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
    await load(currentFilters(), { keepPage: true });
  } catch (error: any) {
    ElMessage.error(error?.message || '批量修改状态失败');
  } finally {
    batchBusy.value = false;
  }
}

async function batchArchiveSelected() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选电脑');
  try {
    await ElMessageBox.confirm(`确认归档选中的 ${selectedCount.value} 台电脑？归档后默认列表将不再显示。`, '批量归档确认', {
      type: 'warning',
      confirmButtonText: '确认归档',
      cancelButtonText: '取消',
    });
    batchBusy.value = true;
    const result: any = await apiPost('/api/pc-assets-bulk', {
      action: 'archive',
      ids: selectedIds.value.map((id) => Number(id)),
    });
    ElMessage.success(result?.message || '批量归档成功');
    clearSelection();
    await load(currentFilters(), { keepPage: true });
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
    await ElMessageBox.confirm(`确认删除选中的 ${selectedCount.value} 台电脑？仅未产生领用/回收记录且非已领用状态的电脑可删除。`, '批量删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });
    batchBusy.value = true;
    let success = 0;
    let archived = 0;
    let failed = 0;
    const failedMsgs: string[] = [];
    for (const row of selectedRows.value.slice()) {
      try {
        const result: any = await apiDelete('/api/pc-assets', { id: row.id });
        success += 1;
        if (result?.archived) archived += 1;
      } catch (error: any) {
        failed += 1;
        failedMsgs.push(`${row.brand || ''} ${row.model || ''}`.trim() || `ID ${row.id}`);
      }
    }
    if (success) {
      clearSelection();
    }
    if (success && !failed) ElMessage.success(archived ? `已处理 ${success} 台电脑（其中归档 ${archived} 台）` : `已删除 ${success} 台电脑`);
    else if (success || failed) ElMessage.warning(`已处理 ${success} 台，失败 ${failed} 台${archived ? `，其中归档 ${archived} 台` : ''}${failedMsgs.length ? `（如：${failedMsgs.slice(0, 3).join('、')}）` : ''}`);
    await load(currentFilters(), { keepPage: true });
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

function downloadAssetTemplate() {
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
    await load(currentFilters(), { keepPage: true });
  } catch (error: any) {
    ElMessage.error(error?.message || '导入失败');
  } finally {
    importBusy.value = false;
  }
}

function onSelectionChange(currentPageSelected: PcAsset[]) {
  syncPageSelection(rows.value, currentPageSelected);
}

onMounted(() => {
  persistState();
  load(currentFilters());
});
</script>

<style scoped>
.asset-page-card {
  border-radius: 18px;
}
.batch-help {
  color: #909399;
  font-size: 12px;
  padding-left: 4px;
}
</style>
