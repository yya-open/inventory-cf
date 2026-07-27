import { ElMessage, ElMessageBox, ElNotification } from './el-services';

export type LedgerFeedbackType = 'success' | 'warning' | 'info' | 'error';

type SuccessOptions = {
  message: string;
  notificationTitle?: string;
  notificationMessage?: string;
  notificationType?: LedgerFeedbackType;
};

type ConfirmOptions = {
  title: string;
  message: string;
  type?: 'success' | 'warning' | 'info' | 'error';
  confirmButtonText?: string;
  cancelButtonText?: string;
};

export function isActionCanceled(error: unknown) {
  return error === 'cancel' || error === 'close';
}

export function notifyLedgerAction(title: string, message: string, type: LedgerFeedbackType = 'success') {
  ElNotification({ title, message, type, duration: 2600, offset: 72 });
}

export function showLedgerSuccess(options: SuccessOptions) {
  ElMessage.success(options.message);
  if (options.notificationTitle && options.notificationMessage) {
    notifyLedgerAction(options.notificationTitle, options.notificationMessage, options.notificationType || 'success');
  }
}

// 不用 instanceof Error：apiClient 抛出的 ApiError 跨 realm 或经 Promise 包装后会判失败，
// 那时后端 message 会被丢掉，用户只看到笼统 fallback
export function showLedgerError(error: unknown, fallbackMessage: string) {
  if (isActionCanceled(error)) return false;
  const message = String((error as { message?: unknown } | null | undefined)?.message ?? '').trim();
  ElMessage.error(message || fallbackMessage);
  return true;
}

export function showLedgerWarning(message: string) {
  ElMessage.warning(message);
}

export function showLedgerInfo(message: string) {
  ElMessage.info(message);
}

export async function confirmLedgerAction(options: ConfirmOptions) {
  await ElMessageBox.confirm(options.message, options.title, {
    type: options.type || 'warning',
    confirmButtonText: options.confirmButtonText || '确认继续',
    cancelButtonText: options.cancelButtonText || '取消',
  });
}
