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

export function showLedgerError(error: unknown, fallbackMessage: string) {
  if (isActionCanceled(error)) return false;
  const message = error instanceof Error ? error.message : '';
  ElMessage.error(message || fallbackMessage);
  return true;
}

export async function confirmLedgerAction(options: ConfirmOptions) {
  await ElMessageBox.confirm(options.message, options.title, {
    type: options.type || 'warning',
    confirmButtonText: options.confirmButtonText || '确认继续',
    cancelButtonText: options.cancelButtonText || '取消',
  });
}
