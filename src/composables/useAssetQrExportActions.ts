import { ref, unref, type ComputedRef, type Ref } from 'vue';
import { ElMessage } from '../utils/el-services';
import { withExportActionFeedback } from '../utils/operationFeedback';
import { buildQrExportFilename } from '../utils/exportNaming';
import {
  exportAssetQrLinksWorkbook,
  exportAssetQrPrintLocal,
  type AssetQrExportProgressCallback,
  type AssetQrLinkRow,
  type AssetQrPrintRecord,
  type ExcelUtilsModule,
  type QrCardUtilsModule,
} from '../utils/assetQrExport';
import type { QrPrintTemplate, QrPrintTemplateKind } from '../utils/qrPrintTemplate';

type QrExportAction = 'batch-cards' | 'batch-sheet' | 'single-cards' | 'single-sheet';

type QrExportMessages = {
  noPermission: string;
  noSelection: string;
  noSingle: string;
  selectedEmpty: string;
  singleEmpty: string;
  sheetSuccess: string;
  cardsSuccess: string;
  linksSuccess: string;
  sheetFailed: string;
  cardsFailed: string;
  linksFailed: string;
  progressSheet: string;
  progressCards: string;
};

type UseAssetQrExportActionsOptions<TAsset> = {
  scope: 'pc' | 'monitor';
  canExport: ComputedRef<boolean> | Ref<boolean>;
  selectedRows: ComputedRef<TAsset[]>;
  selectedCount: ComputedRef<number>;
  singleRow: Ref<TAsset | null>;
  exportBusy: Ref<boolean>;
  batchBusy: Ref<boolean>;
  getId: (row: TAsset) => number | string;
  fetchBulkLinks: (ids: Array<number | string>) => Promise<AssetQrLinkRow[]>;
  loadExcelUtils: () => Promise<ExcelUtilsModule>;
  loadQrCardUtils: () => Promise<QrCardUtilsModule>;
  mapSheetRecord: (row: TAsset, url: string, template?: Partial<QrPrintTemplate>) => AssetQrPrintRecord | null;
  mapCardRecord: (row: TAsset, url: string, template?: Partial<QrPrintTemplate>) => AssetQrPrintRecord | null;
  linkFilename: (count: number) => string;
  linkHeaders: Array<{ key: string; title: string }>;
  mapLinkWorkbookRow: (row: TAsset, url: string) => Record<string, any>;
  singleSheetLabel: (row: TAsset) => string;
  singleCardsLabel: (row: TAsset) => string;
  sheetTitle: string;
  cardsTitle: string;
  selectedSheetTitle: string;
  selectedCardsTitle: string;
  messages: QrExportMessages;
  startProgress: (title: string) => void;
  updateProgress: AssetQrExportProgressCallback;
  finishProgress: () => void;
};

export function useAssetQrExportActions<TAsset>(options: UseAssetQrExportActionsOptions<TAsset>) {
  const qrTemplateVisible = ref(false);
  const qrTemplateKind = ref<QrPrintTemplateKind>('cards');
  const qrTemplateAction = ref<QrExportAction>('batch-cards');

  async function exportQrPrint(optionsForPrint: {
    mode: QrPrintTemplateKind;
    rows: TAsset[];
    title: string;
    filename: string;
    template?: Partial<QrPrintTemplate>;
    emptyMessage: string;
  }) {
    const result = await exportAssetQrPrintLocal({
      mode: optionsForPrint.mode,
      rows: optionsForPrint.rows,
      getId: options.getId,
      fetchBulkLinks: options.fetchBulkLinks,
      mapPrintRecord: (row, url) => optionsForPrint.mode === 'cards'
        ? options.mapCardRecord(row, url, optionsForPrint.template)
        : options.mapSheetRecord(row, url, optionsForPrint.template),
      loadQrCardUtils: options.loadQrCardUtils,
      filename: optionsForPrint.filename,
      title: optionsForPrint.title,
      template: optionsForPrint.template,
      onProgress: options.updateProgress,
    });
    if (result.empty) {
      ElMessage.warning(optionsForPrint.emptyMessage);
      return;
    }
  }

  async function exportSelectedQrLinks() {
    if (!unref(options.selectedCount)) {
      ElMessage.warning(options.messages.noSelection);
      return;
    }
    try {
      options.batchBusy.value = true;
      const count = unref(options.selectedCount);
      await withExportActionFeedback(`导出二维码链接（${count}条）`, () =>
        exportAssetQrLinksWorkbook({
          rows: unref(options.selectedRows),
          getId: options.getId,
          fetchBulkLinks: options.fetchBulkLinks,
          loadExcelUtils: options.loadExcelUtils,
          filename: options.linkFilename(count),
          headers: options.linkHeaders,
          mapWorkbookRow: options.mapLinkWorkbookRow,
        })
      );
    } catch (error: any) {
      ElMessage.error(error?.message || options.messages.linksFailed);
    } finally {
      options.batchBusy.value = false;
    }
  }

  function openQrPrintTemplate(kind: QrPrintTemplateKind, action?: QrExportAction) {
    if (!unref(options.canExport)) {
      ElMessage.warning(options.messages.noPermission);
      return;
    }
    const nextAction = action || (kind === 'cards' ? 'batch-cards' : 'batch-sheet');
    if (nextAction.startsWith('batch') && !unref(options.selectedCount)) {
      ElMessage.warning(options.messages.noSelection);
      return;
    }
    if (nextAction.startsWith('single') && !(options.singleRow.value as any)?.id) {
      ElMessage.warning(options.messages.noSingle);
      return;
    }
    qrTemplateKind.value = kind;
    qrTemplateAction.value = nextAction;
    qrTemplateVisible.value = true;
  }

  async function runWithProgress(title: string, task: () => Promise<void>) {
    try {
      options.startProgress(title);
      await task();
    } finally {
      options.finishProgress();
    }
  }

  async function exportSingleSheet(template?: Partial<QrPrintTemplate>) {
    const row = options.singleRow.value;
    if (!row) return;
    await exportQrPrint({
      mode: 'sheet',
      rows: [row],
      title: options.sheetTitle,
      filename: buildQrExportFilename({ scope: options.scope, kind: 'sheet', count: 1, template, singleLabel: options.singleSheetLabel(row) }),
      template,
      emptyMessage: options.messages.singleEmpty,
    });
  }

  async function exportSingleCards(template?: Partial<QrPrintTemplate>) {
    const row = options.singleRow.value;
    if (!row) return;
    await exportQrPrint({
      mode: 'cards',
      rows: [row],
      title: options.cardsTitle,
      filename: buildQrExportFilename({ scope: options.scope, kind: 'cards', count: 1, template, singleLabel: options.singleCardsLabel(row) }),
      template,
      emptyMessage: options.messages.singleEmpty,
    });
  }

  async function executeExportSelectedQrSheet(template?: Partial<QrPrintTemplate>) {
    try {
      options.exportBusy.value = true;
      await runWithProgress(options.messages.progressSheet, () => exportQrPrint({
        mode: 'sheet',
        rows: unref(options.selectedRows),
        title: options.selectedSheetTitle,
        filename: buildQrExportFilename({ scope: options.scope, kind: 'sheet', count: unref(options.selectedRows).length, template }),
        template,
        emptyMessage: options.messages.selectedEmpty,
      }));
    } catch (error: any) {
      ElMessage.error(error?.message || options.messages.sheetFailed);
    } finally {
      options.exportBusy.value = false;
    }
  }

  async function executeExportSelectedQrCards(template?: Partial<QrPrintTemplate>) {
    try {
      options.exportBusy.value = true;
      await runWithProgress(options.messages.progressCards, () => exportQrPrint({
        mode: 'cards',
        rows: unref(options.selectedRows),
        title: options.selectedCardsTitle,
        filename: buildQrExportFilename({ scope: options.scope, kind: 'cards', count: unref(options.selectedRows).length, template }),
        template,
        emptyMessage: options.messages.selectedEmpty,
      }));
    } catch (error: any) {
      ElMessage.error(error?.message || options.messages.cardsFailed);
    } finally {
      options.exportBusy.value = false;
    }
  }

  async function submitQrPrintTemplate(template: QrPrintTemplate) {
    if (qrTemplateAction.value === 'single-cards') {
      await runWithProgress(options.messages.progressCards, () => exportSingleCards(template));
      return;
    }
    if (qrTemplateAction.value === 'single-sheet') {
      await runWithProgress(options.messages.progressSheet, () => exportSingleSheet(template));
      return;
    }
    if (qrTemplateKind.value === 'cards') {
      await executeExportSelectedQrCards(template);
      return;
    }
    await executeExportSelectedQrSheet(template);
  }

  function exportSelectedQrCards() {
    openQrPrintTemplate('cards');
  }

  function exportSelectedQrPng() {
    openQrPrintTemplate('sheet');
  }

  function downloadQr() {
    openQrPrintTemplate('sheet', 'single-sheet');
  }

  function downloadLabel() {
    openQrPrintTemplate('cards', 'single-cards');
  }

  return {
    qrTemplateVisible,
    qrTemplateKind,
    openQrPrintTemplate,
    submitQrPrintTemplate,
    exportSelectedQrLinks,
    exportSelectedQrCards,
    exportSelectedQrPng,
    downloadQr,
    downloadLabel,
  };
}
