import type { ComputedRef, Ref } from 'vue';
import { fetchBulkMonitorAssetQrLinks } from '../api/assetQr';
import { useAssetQrDialog } from './useAssetQrDialog';
import { useAssetQrExportActions } from './useAssetQrExportActions';
import type { MonitorAsset } from '../types/assets';
import { assetStatusText } from '../types/assets';
import type { AssetQrExportProgress } from '../utils/assetQrExport';
import type { QrPrintTemplate } from '../utils/qrPrintTemplate';

type UseMonitorAssetQrOptions = {
  canExport: ComputedRef<boolean>;
  canReset: ComputedRef<boolean>;
  selectedRows: ComputedRef<MonitorAsset[]>;
  selectedCount: ComputedRef<number>;
  exportBusy: Ref<boolean>;
  batchBusy: Ref<boolean>;
  locationText: (row: MonitorAsset) => string;
  loadExcelUtils: () => Promise<typeof import('../utils/excel')>;
  loadQrCardUtils: () => Promise<typeof import('../utils/qrCards')>;
  startProgress: (title: string) => void;
  updateProgress: (progress: AssetQrExportProgress) => void;
  finishProgress: () => void;
};

function modelText(row: MonitorAsset) {
  return [row.brand, row.model].filter(Boolean).join(' ') || `显示器 #${row.id}`;
}

function buildMonitorQrSheetRecord(
  row: MonitorAsset,
  url: string,
  locationText: (row: MonitorAsset) => string,
  template?: Partial<QrPrintTemplate>
) {
  if (!url) return null;
  const mode = template?.content_mode || 'detail';
  const model = modelText(row);
  const assetCode = row.asset_code || '-';
  const sn = row.sn || '-';
  if (mode === 'qr_only') return { title: '', subtitle: '', meta: [], url };
  if (mode === 'model_sn') return { title: model, subtitle: `SN：${sn}`, meta: [], url };
  if (mode === 'model_asset') return { title: model, subtitle: `资产编号：${assetCode}`, meta: [], url };
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

function buildMonitorQrCardRecord(
  row: MonitorAsset,
  url: string,
  locationText: (row: MonitorAsset) => string,
  template?: Partial<QrPrintTemplate>
) {
  if (!url) return null;
  const mode = template?.content_mode || 'detail';
  const model = modelText(row);
  const assetCode = row.asset_code || '-';
  const sn = row.sn || '-';
  if (mode === 'qr_only') return { title: '', subtitle: '', meta: [], url };
  if (mode === 'model_sn') return { title: model, subtitle: `SN：${sn}`, meta: [], url };
  if (mode === 'model_asset') return { title: model, subtitle: `资产编号：${assetCode}`, meta: [], url };
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

export function useMonitorAssetQr(options: UseMonitorAssetQrOptions) {
  const qrDialog = useAssetQrDialog<MonitorAsset>({
    kind: 'monitor',
    size: 360,
    canReset: options.canReset,
    getId: (row) => Number(row.id || 0),
    getVersion: (row) => String(row?.qr_updated_at || row?.updated_at || ''),
    qrTokenPath: (id) => `/api/monitor-asset-qr-token?id=${encodeURIComponent(String(id))}`,
    resetQrPath: (id) => `/api/monitor-assets-reset-qr?id=${id}`,
    messages: {
      noPermission: '当前账号没有重置二维码权限',
      missingId: '缺少资产 ID',
      emptyLink: '二维码链接生成失败',
      generateFailed: '生成二维码失败',
      copySuccess: '已复制',
      copyFailed: '复制失败，请手动复制',
      resetTitle: '重置二维码',
      resetConfirm: '重置后旧二维码将立即失效，确认继续？',
      resetConfirmButton: '重置',
      resetSuccess: '已重置',
      resetFailed: '重置失败',
    },
  });

  const exportActions = useAssetQrExportActions<MonitorAsset>({
    scope: 'monitor',
    canExport: options.canExport,
    selectedRows: options.selectedRows,
    selectedCount: options.selectedCount,
    singleRow: qrDialog.row,
    exportBusy: options.exportBusy,
    batchBusy: options.batchBusy,
    getId: (row) => Number(row.id),
    fetchBulkLinks: fetchBulkMonitorAssetQrLinks,
    loadExcelUtils: options.loadExcelUtils,
    loadQrCardUtils: options.loadQrCardUtils,
    mapSheetRecord: (row, url, template) => buildMonitorQrSheetRecord(row, url, options.locationText, template),
    mapCardRecord: (row, url, template) => buildMonitorQrCardRecord(row, url, options.locationText, template),
    linkFilename: (count) => `显示器二维码链接_${count}条.xlsx`,
    linkHeaders: [
      { key: 'id', title: 'ID' },
      { key: 'asset_code', title: '资产编号' },
      { key: 'sn', title: 'SN' },
      { key: 'brand', title: '品牌' },
      { key: 'model', title: '型号' },
      { key: 'status', title: '状态' },
      { key: 'url', title: '二维码链接' },
    ],
    mapLinkWorkbookRow: (row, url) => ({
      id: row.id,
      asset_code: row.asset_code,
      sn: row.sn,
      brand: row.brand,
      model: row.model,
      status: assetStatusText(row.status),
      url,
    }),
    singleSheetLabel: (row) => `显示器二维码_${row.asset_code || row.id || 'monitor'}`,
    singleCardsLabel: (row) => `显示器标签_${row.asset_code || row.id || 'monitor'}`,
    sheetTitle: '显示器二维码',
    cardsTitle: '显示器标签',
    selectedSheetTitle: '显示器二维码图版',
    selectedCardsTitle: '显示器二维码卡片',
    messages: {
      noPermission: '当前账号没有二维码/标签导出权限',
      noSelection: '请先勾选显示器',
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
