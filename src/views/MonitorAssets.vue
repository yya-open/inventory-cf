<template>
  <div>
    <MonitorAssetsToolbar
      v-model:status="status"
      v-model:location-id="locationId"
      v-model:keyword="keyword"
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
      @update:visible-columns="updateVisibleColumns"
      @move-column="moveVisibleColumn"
      @search="reloadList"
      @export="exportExcel"
      @export-selected="exportSelectedRows"
      @clear-selection="clearSelection"
      @export-selected-qr="exportSelectedQrLinks"
      @batch-delete="batchDeleteSelected"
      @restore-columns="restoreDefaultColumns"
      @download-template="downloadMonitorTemplate"
      @import-file="onImportMonitorFile"
      @open-create="openCreate"
      @toolbar-more="handleToolbarMore"
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
      @in="openIn"
      @out="openOut"
      @row-more="handleRowMore"
      @selection-change="onSelectionChange"
      @column-resize="updateColumnWidth"
      @page-change="(value) => onPageChange(currentFilters(), value)"
      @size-change="(value) => onPageSizeChange(currentFilters(), value)"
    />

    <MonitorAssetFormDialog
      v-model:visible="dlgAsset.show"
      :mode="dlgAsset.mode"
      :form="dlgAsset.form"
      :location-options="locationOptions"
      :saving="assetSaving"
      @save="saveAsset"
    />

    <MonitorAssetOperationDialog
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import QRCode from 'qrcode';
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import { countMonitorAssets, listAllLocations, listEnabledLocations, listMonitorAssets } from '../api/assetLedgers';
import { useAssetLedgerPage } from '../composables/useAssetLedgerPage';
import { useCrossPageSelection } from '../composables/useCrossPageSelection';
import { can } from '../store/auth';
import type { LocationRow, MonitorAsset, MonitorFilters } from '../types/assets';
import { assetStatusText } from '../types/assets';
import { downloadTemplate, exportToXlsx, parseXlsx } from '../utils/excel';
import { readJsonStorage, writeJsonStorage } from '../utils/storage';
import { moveColumnKey, normalizeColumnOrder, normalizeColumnWidths, normalizeVisibleColumns, orderVisibleColumns, setColumnWidth } from '../utils/tableColumns';
import MonitorAssetsToolbar from '../components/assets/MonitorAssetsToolbar.vue';
import MonitorAssetsTable from '../components/assets/MonitorAssetsTable.vue';
import MonitorAssetFormDialog from '../components/assets/MonitorAssetFormDialog.vue';
import MonitorAssetOperationDialog from '../components/assets/MonitorAssetOperationDialog.vue';
import MonitorAssetQrDialog from '../components/assets/MonitorAssetQrDialog.vue';
import MonitorLocationManagerDialog from '../components/assets/MonitorLocationManagerDialog.vue';

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
const persistedState = readJsonStorage(STORAGE_KEY, { status: '', locationId: '', keyword: '', pageSize: 50, visibleColumns: MONITOR_COLUMN_KEYS, columnOrder: MONITOR_COLUMN_KEYS, columnWidths: {} as Record<string, number> });

const status = ref(String(persistedState.status || ''));
const locationId = ref(String(persistedState.locationId || ''));
const keyword = ref(String(persistedState.keyword || ''));
const columnOrder = ref(normalizeColumnOrder(persistedState.columnOrder, MONITOR_COLUMN_KEYS));
const visibleColumns = ref(orderVisibleColumns(normalizeVisibleColumns(persistedState.visibleColumns, MONITOR_COLUMN_KEYS), columnOrder.value));
const columnWidths = ref(normalizeColumnWidths(persistedState.columnWidths, MONITOR_COLUMN_KEYS));
const locations = ref<LocationRow[]>([]);
const canOperator = computed(() => can('operator'));
const isAdmin = computed(() => can('admin'));

const currentFilters = (): MonitorFilters => ({
  status: status.value || '',
  locationId: String(locationId.value || ''),
  keyword: keyword.value || '',
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

async function loadLocations() {
  try {
    locations.value = await listEnabledLocations();
  } catch (error: any) {
    await handleMaybeMissingSchema(error);
  }
}

const { rows, loading, page, pageSize, total, load, reload, onPageChange, onPageSizeChange, fetchAll } = useAssetLedgerPage<MonitorFilters, MonitorAsset>({
  createFilterKey: (filters) => `status=${filters.status}&location=${filters.locationId}&keyword=${filters.keyword}`,
  fetchPage: async (filters, currentPage, currentPageSize, fast) => {
    try {
      return await listMonitorAssets(filters, currentPage, currentPageSize, fast);
    } catch (error: any) {
      await handleMaybeMissingSchema(error);
      return await listMonitorAssets(filters, currentPage, currentPageSize, fast);
    }
  },
  fetchTotal: async (filters) => {
    try {
      return await countMonitorAssets(filters);
    } catch (error: any) {
      await handleMaybeMissingSchema(error);
      return await countMonitorAssets(filters);
    }
  },
});

pageSize.value = Number(persistedState.pageSize || pageSize.value || 50);

const monitorColumnOptions = [...MONITOR_COLUMN_OPTIONS];
const exportBusy = ref(false);
const importBusy = ref(false);
const initQrBusy = ref(false);
const batchBusy = ref(false);

const { selectedIds, selectedRows, selectedCount, syncPageSelection, clearSelection } = useCrossPageSelection<MonitorAsset>((row) => String(row.id));
const assetSaving = ref(false);
const opSubmitting = ref(false);
const locationSaving = ref(false);

function persistState() {
  writeJsonStorage(STORAGE_KEY, {
    status: status.value || '',
    locationId: String(locationId.value || ''),
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

watch([status, locationId, keyword, pageSize, visibleColumns, columnOrder, columnWidths], persistState);
watch(keyword, (_value, oldValue) => {
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
  if (command === 'return') return openReturn(row);
  if (command === 'transfer') return openTransfer(row);
  if (command === 'delete') return removeAsset(row);
}

async function exportSelectedQrLinks() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  try {
    batchBusy.value = true;
    const linkRows = [];
    for (const row of selectedRows.value) {
      const result: any = await apiGet(`/api/monitor-asset-qr-token?id=${encodeURIComponent(String(row.id))}`);
      linkRows.push({
        id: row.id,
        asset_code: row.asset_code,
        sn: row.sn,
        brand: row.brand,
        model: row.model,
        status: assetStatusText(row.status),
        url: result?.url || '',
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

async function batchDeleteSelected() {
  if (!selectedCount.value) return ElMessage.warning('请先勾选显示器');
  try {
    await ElMessageBox.confirm(`确认删除选中的 ${selectedCount.value} 台显示器？仅未产生事务记录的资产可删除。`, '批量删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });
    batchBusy.value = true;
    let success = 0;
    let failed = 0;
    const failedMsgs: string[] = [];
    for (const row of selectedRows.value.slice()) {
      try {
        await apiDelete('/api/monitor-assets', { id: row.id });
        success += 1;
      } catch (error: any) {
        failed += 1;
        failedMsgs.push(`${row.asset_code || ''}`.trim() || `ID ${row.id}`);
      }
    }
    if (success) clearSelection();
    if (success && !failed) ElMessage.success(`已删除 ${success} 台显示器`);
    else if (success || failed) ElMessage.warning(`已删除 ${success} 台，失败 ${failed} 台${failedMsgs.length ? `（如：${failedMsgs.slice(0, 3).join('、')}）` : ''}`);
    await load(currentFilters(), { keepPage: true });
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

function downloadMonitorTemplate() {
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
    await load(currentFilters(), { keepPage: true });
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

function openCreate() {
  dlgAsset.mode = 'create';
  dlgAsset.form = { id: 0, asset_code: '', sn: '', brand: '', model: '', size_inch: '', remark: '', location_id: '' as any };
  dlgAsset.show = true;
}

function openEdit(row: MonitorAsset) {
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
    await load(currentFilters(), { keepPage: true });
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
      await load(currentFilters(), { keepPage: true });
    } catch (nextError: any) {
      ElMessage.error(nextError.message || '操作失败');
    }
  } finally {
    assetSaving.value = false;
  }
}

async function removeAsset(row: MonitorAsset) {
  try {
    await ElMessageBox.confirm(`确认删除显示器台账：${[row.brand, row.model].filter(Boolean).join(' ')}（资产编号: ${row.asset_code || '-'}）？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });
    loading.value = true;
    await apiDelete('/api/monitor-assets', { id: row.id });
    ElMessage.success('删除成功');
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load(currentFilters(), { keepPage: true });
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error?.message || '删除失败');
  } finally {
    loading.value = false;
  }
}

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

function openIn(row: MonitorAsset) {
  dlgOp.kind = 'in';
  dlgOp.title = '显示器入库';
  dlgOp.asset = row;
  dlgOp.form = { location_id: row.location_id || '', employee_no: '', employee_name: '', department: '', remark: '' };
  dlgOp.show = true;
}

function openOut(row: MonitorAsset) {
  dlgOp.kind = 'out';
  dlgOp.title = '显示器出库（领用）';
  dlgOp.asset = row;
  dlgOp.form = { location_id: row.location_id || '', employee_no: '', employee_name: '', department: '', remark: '' };
  dlgOp.show = true;
}

function openReturn(row: MonitorAsset) {
  dlgOp.kind = 'return';
  dlgOp.title = '显示器归还';
  dlgOp.asset = row;
  dlgOp.form = { location_id: row.location_id || '', employee_no: '', employee_name: '', department: '', remark: '' };
  dlgOp.show = true;
}

function openTransfer(row: MonitorAsset) {
  dlgOp.kind = 'transfer';
  dlgOp.title = '显示器调拨';
  dlgOp.asset = row;
  dlgOp.form = { location_id: row.location_id || '', employee_no: '', employee_name: '', department: '', remark: '' };
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
    await load(currentFilters(), { keepPage: true });
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

async function openQr(row: MonitorAsset) {
  qrVisible.value = true;
  qrRow.value = { ...row };
  qrLink.value = '';
  qrDataUrl.value = '';
  qrLoading.value = true;
  try {
    const id = Number(row?.id || 0);
    if (!id) throw new Error('缺少资产ID');
    const result: any = await apiGet(`/api/monitor-asset-qr-token?id=${encodeURIComponent(String(id))}`);
    const link = String(result?.url || '');
    qrLink.value = link;
    if (link) qrDataUrl.value = await QRCode.toDataURL(link, { margin: 1, width: 360 });
  } catch (error: any) {
    ElMessage.error(error?.message || '生成二维码失败');
  } finally {
    qrLoading.value = false;
  }
}

function downloadQr() {
  if (!qrDataUrl.value) return;
  const link = document.createElement('a');
  link.href = qrDataUrl.value;
  link.download = `显示器二维码_${qrRow.value?.asset_code || 'monitor'}.png`;
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
    const result: any = await apiPost(`/api/monitor-assets-reset-qr?id=${id}`, {});
    const link = String(result?.url || '');
    qrLink.value = link;
    if (link) qrDataUrl.value = await QRCode.toDataURL(link, { margin: 1, width: 360 });
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
    await ElMessageBox.confirm('将为所有缺少二维码Key的显示器批量生成Key（分批执行）。继续？', '初始化二维码Key', {
      type: 'warning',
      confirmButtonText: '继续',
      cancelButtonText: '取消',
    });
    initQrBusy.value = true;
    let totalUpdated = 0;
    for (let index = 0; index < 20; index += 1) {
      const result: any = await apiPost('/api/monitor-assets-init-qr-keys', { batch_size: 50 });
      const updated = Number(result?.updated || 0);
      totalUpdated += updated;
      if (updated <= 0) break;
    }
    ElMessage.success(totalUpdated ? `已补齐 ${totalUpdated} 条` : '无需补齐（都已存在）');
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
  dlgLoc.show = true;
  await refreshLocationMgr();
}

async function refreshLocationMgr() {
  dlgLoc.rows = (await listAllLocations()).map((item) => ({ ...item })) as MonitorAsset[];
  locations.value = dlgLoc.rows as any;
}

async function createLocation() {
  if (locationSaving.value) return;
  try {
    locationSaving.value = true;
    if (!dlgLoc.newName.trim()) return ElMessage.warning('请输入位置名称');
    await apiPost('/api/pc-locations', { name: dlgLoc.newName.trim(), parent_id: dlgLoc.parentId || null });
    dlgLoc.newName = '';
    dlgLoc.parentId = '';
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
  await loadLocations();
  await load(currentFilters());
});
</script>
