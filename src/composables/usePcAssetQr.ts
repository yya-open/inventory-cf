import type { ComputedRef, Ref } from 'vue';
import { fetchBulkPcAssetQrLinks } from '../api/assetQr';
import { useAssetQrDialog } from './useAssetQrDialog';
import { useAssetQrExportActions } from './useAssetQrExportActions';
import type { PcAsset } from '../types/assets';
import { assetStatusText } from '../types/assets';
import type { AssetQrExportProgress } from '../utils/assetQrExport';
import type { QrPrintTemplate } from '../utils/qrPrintTemplate';

type UsePcAssetQrOptions = {
  canExport: ComputedRef<boolean>;
  canReset: ComputedRef<boolean>;
  selectedRows: ComputedRef<PcAsset[]>;
  selectedCount: ComputedRef<number>;
  exportBusy: Ref<boolean>;
  batchBusy: Ref<boolean>;
  loadExcelUtils: () => Promise<typeof import('../utils/excel')>;
  loadQrCardUtils: () => Promise<typeof import('../utils/qrCards')>;
  startProgress: (title: string) => void;
  updateProgress: (progress: AssetQrExportProgress) => void;
  finishProgress: () => void;
};

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

export function usePcAssetQr(options: UsePcAssetQrOptions) {
  const qrDialog = useAssetQrDialog<PcAsset>({
    kind: 'pc',
    size: 260,
    canReset: options.canReset,
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

  const exportActions = useAssetQrExportActions<PcAsset>({
    scope: 'pc',
    canExport: options.canExport,
    selectedRows: options.selectedRows,
    selectedCount: options.selectedCount,
    singleRow: qrDialog.row,
    exportBusy: options.exportBusy,
    batchBusy: options.batchBusy,
    getId: (row) => Number(row.id),
    fetchBulkLinks: fetchBulkPcAssetQrLinks,
    loadExcelUtils: options.loadExcelUtils,
    loadQrCardUtils: options.loadQrCardUtils,
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
    startProgress: options.startProgress,
    updateProgress: options.updateProgress,
    finishProgress: options.finishProgress,
  });

  return {
    ...qrDialog,
    ...exportActions,
  };
}