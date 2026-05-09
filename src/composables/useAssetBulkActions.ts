import { unref, type ComputedRef, type Ref } from 'vue';
import { apiPost } from '../api/client';
import { withDestructiveActionFeedback } from '../utils/destructiveAction';
import { confirmLedgerAction, notifyLedgerAction, showLedgerError, showLedgerSuccess } from '../utils/ledgerOperationFeedback';
import { buildBulkDeleteConfirmTip, summarizeBulkDeleteResult } from '../views/assets/assetBulkActions';
import type { ExcelUtilsModule } from '../utils/assetQrExport';
import { ElMessage } from '../utils/el-services';

type BulkActionRunOptions = {
  action: string;
  payload?: Record<string, any>;
  successMessage: string;
  notificationTitle: string;
  notificationMessage: string;
  notificationType?: 'success' | 'warning' | 'info' | 'error';
  errorMessage: string;
  closeDialog?: () => void;
  applyResult?: (result: any) => void;
  stable?: boolean;
};

type BulkDeleteRunOptions = {
  requestLabel: string;
  applyDeletePatch: (successItems: Array<{ id: number; action: string; reason?: string | null }>) => void;
  errorMessage: string;
};

type UseAssetBulkActionsOptions = {
  endpoint: string;
  assetLabel: string;
  selectedCount: ComputedRef<number>;
  selectedNumberIds: ComputedRef<number[]>;
  archivedCount: ComputedRef<number>;
  batchBusy: Ref<boolean>;
  clearSelection: () => void;
  ensureLocalPatchedPageStable: (force?: boolean) => Promise<void>;
  loadExcelUtils: () => Promise<ExcelUtilsModule>;
};

export function useAssetBulkActions(options: UseAssetBulkActionsOptions) {
  async function confirmBatchRisk(title: string, message: string) {
    await confirmLedgerAction({ title, message, confirmButtonText: '确认继续' });
  }

  async function exportBatchFailures(filename: string, rows: Array<Record<string, any>>) {
    if (!rows.length) return;
    const { exportToXlsx } = await options.loadExcelUtils();
    await exportToXlsx({
      filename,
      sheetName: '失败明细',
      headers: Object.keys(rows[0]).map((key) => ({ key, title: key })),
      rows,
    });
  }

  async function runBulkAction(input: BulkActionRunOptions) {
    try {
      options.batchBusy.value = true;
      const result: any = await apiPost(options.endpoint, {
        action: input.action,
        ids: unref(options.selectedNumberIds),
        ...(input.payload || {}),
      });
      showLedgerSuccess({
        message: result?.message || input.successMessage,
        notificationTitle: input.notificationTitle,
        notificationMessage: input.notificationMessage,
        notificationType: input.notificationType,
      });
      input.closeDialog?.();
      input.applyResult?.(result);
      options.clearSelection();
      await options.ensureLocalPatchedPageStable(Boolean(input.stable));
      return result;
    } catch (error) {
      showLedgerError(error, input.errorMessage);
      return null;
    } finally {
      options.batchBusy.value = false;
    }
  }

  async function runBulkDelete(input: BulkDeleteRunOptions) {
    try {
      await confirmBatchRisk('批量删除确认', buildBulkDeleteConfirmTip(options.assetLabel, unref(options.selectedCount), unref(options.archivedCount)));
      options.batchBusy.value = true;
      const result: any = await withDestructiveActionFeedback(input.requestLabel, () => apiPost(options.endpoint, {
        action: 'delete',
        ids: unref(options.selectedNumberIds),
      }));
      const summary = summarizeBulkDeleteResult(options.assetLabel, result);
      if (summary.processed) options.clearSelection();
      if (summary.level === 'success') {
        showLedgerSuccess({
          message: summary.message,
          notificationTitle: '批量删除完成',
          notificationMessage: summary.message,
          notificationType: 'warning',
        });
      } else if (summary.level === 'warning') {
        ElMessage.warning(summary.message);
        notifyLedgerAction('批量删除部分完成', summary.message, 'warning');
      }
      if (Array.isArray(result?.success_items)) input.applyDeletePatch(result.success_items);
      if (summary.failedRecords.length) await exportBatchFailures(`${options.assetLabel}批量删除失败明细_${summary.failedRecords.length}条.xlsx`, summary.failedRecords);
      await options.ensureLocalPatchedPageStable(true);
      return result;
    } catch (error) {
      showLedgerError(error, input.errorMessage);
      return null;
    } finally {
      options.batchBusy.value = false;
    }
  }

  return {
    confirmBatchRisk,
    exportBatchFailures,
    runBulkAction,
    runBulkDelete,
  };
}
