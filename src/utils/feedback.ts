import { ElMessage, ElMessageBox, ElNotification } from './el-services';

export type FeedbackType = 'success' | 'warning' | 'info' | 'error';

type MessageOptions = {
  duration?: number;
  showClose?: boolean;
};

type ConfirmOptions = {
  title: string;
  message: string;
  type?: FeedbackType;
  confirmButtonText?: string;
  cancelButtonText?: string;
  distinguishCancelAndClose?: boolean;
};

type PromptOptions = ConfirmOptions & {
  inputPlaceholder?: string;
  inputValue?: string;
  inputType?: 'text' | 'textarea';
  inputValidator?: (value: string) => boolean | string;
};

type HtmlAlertOptions = {
  title: string;
  html: string;
  type?: FeedbackType;
};

type AlertOptions = {
  title: string;
  message: string;
  type?: FeedbackType;
  confirmButtonText?: string;
};

function showMessage(type: FeedbackType, message: string, options: MessageOptions = {}) {
  return ElMessage({ type, message, ...options });
}

export function isActionCanceled(error: unknown) {
  return error === 'cancel' || error === 'close';
}

export function showSuccess(message: string, options?: MessageOptions) {
  return showMessage('success', message, options);
}

export function showWarning(message: string, options?: MessageOptions) {
  return showMessage('warning', message, options);
}

export function showInfo(message: string, options?: MessageOptions) {
  return showMessage('info', message, options);
}

export function showError(message: string, options?: MessageOptions) {
  return showMessage('error', message, options);
}

// 用于 catch 分支：取消操作静默返回 false，否则取 error.message 并在缺失时回退到给定文案。
// 不依赖 instanceof Error，后端抛出的普通对象同样能保留原始信息。
export function showApiError(error: unknown, fallbackMessage: string, options?: MessageOptions) {
  if (isActionCanceled(error)) return false;
  const message = String((error as { message?: unknown } | null | undefined)?.message ?? '').trim();
  showMessage('error', message || fallbackMessage, options);
  return true;
}

export function notifyAction(title: string, message: string, type: FeedbackType = 'success') {
  return ElNotification({ title, message, type, duration: 2600, offset: 72 });
}

// 仅暴露 close，避免调用方依赖 Element Plus 的消息实例细节。
export function showPending(message: string) {
  const pending = ElMessage({ type: 'info', message, duration: 0, showClose: false });
  return { close: () => pending.close() };
}

function optionIfDefined<TKey extends string, TValue>(key: TKey, value: TValue | undefined) {
  return value === undefined ? {} : { [key]: value } as Record<TKey, TValue>;
}

export async function confirmAction(options: ConfirmOptions) {
  return ElMessageBox.confirm(options.message, options.title, {
    ...optionIfDefined('type', options.type),
    ...optionIfDefined('confirmButtonText', options.confirmButtonText),
    ...optionIfDefined('cancelButtonText', options.cancelButtonText),
    ...optionIfDefined('distinguishCancelAndClose', options.distinguishCancelAndClose),
  });
}

export async function promptAction(options: PromptOptions) {
  return ElMessageBox.prompt(options.message, options.title, {
    ...optionIfDefined('type', options.type),
    ...optionIfDefined('confirmButtonText', options.confirmButtonText),
    ...optionIfDefined('cancelButtonText', options.cancelButtonText),
    ...optionIfDefined('inputPlaceholder', options.inputPlaceholder),
    ...optionIfDefined('inputValue', options.inputValue),
    ...optionIfDefined('inputType', options.inputType),
    ...optionIfDefined('inputValidator', options.inputValidator),
  });
}

export async function alertAction(options: AlertOptions) {
  return ElMessageBox.alert(options.message, options.title, {
    ...optionIfDefined('type', options.type),
    ...optionIfDefined('confirmButtonText', options.confirmButtonText),
  });
}

export async function alertHtml(options: HtmlAlertOptions) {
  return ElMessageBox.alert(options.html, options.title, {
    ...optionIfDefined('type', options.type),
    dangerouslyUseHTMLString: true,
  });
}