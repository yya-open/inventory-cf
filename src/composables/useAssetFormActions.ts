import type { Ref } from 'vue';
import { notifyAction, showApiError, showSuccess, showWarning, type FeedbackType } from '../utils/feedback';

type FieldRule<TPayload> = {
  key: keyof TPayload;
  label: string;
  message?: string;
};

type SaveActionInput<TPayload> = {
  busy: Ref<boolean>;
  buildPayload: () => TPayload | null | undefined;
  validate?: (payload: TPayload) => boolean | Promise<boolean>;
  submit: (payload: TPayload) => Promise<unknown>;
  onSuccess?: (payload: TPayload) => void | Promise<void>;
  recoverBeforeRetry?: (error: unknown) => void | Promise<void>;
  successMessage: string;
  notificationTitle?: string;
  notificationMessage?: string | ((payload: TPayload) => string);
  notificationType?: FeedbackType;
  errorMessage: string;
};

function isBlank(value: unknown) {
  return String(value ?? '').trim() === '';
}

export function trimText(value: unknown) {
  return String(value ?? '').trim();
}

export function validateRequiredFields<TPayload extends Record<string, any>>(payload: TPayload, fields: Array<FieldRule<TPayload>>) {
  for (const field of fields) {
    if (!isBlank(payload[field.key])) {
      continue;
    }
    showWarning(field.message || `${field.label}必填`);
    return false;
  }
  return true;
}

export function useAssetFormActions() {
  async function runSaveAction<TPayload>(input: SaveActionInput<TPayload>) {
    if (input.busy.value) return false;
    const payload = input.buildPayload();
    if (payload == null) return false;
    const nextPayload = payload as TPayload;
    if (input.validate) {
      const valid = await input.validate(nextPayload);
      if (!valid) return false;
    }

    async function submitAndComplete() {
      await input.submit(nextPayload);
      showSuccess(input.successMessage);
      const notificationMessage = typeof input.notificationMessage === 'function'
        ? input.notificationMessage(nextPayload)
        : input.notificationMessage;
      if (input.notificationTitle && notificationMessage) {
        notifyAction(input.notificationTitle, notificationMessage, input.notificationType || 'success');
      }
      await input.onSuccess?.(nextPayload);
    }

    input.busy.value = true;
    try {
      await submitAndComplete();
      return true;
    } catch (error) {
      if (!input.recoverBeforeRetry) {
        showApiError(error, input.errorMessage);
        return false;
      }
      try {
        await input.recoverBeforeRetry(error);
        await submitAndComplete();
        return true;
      } catch (nextError) {
        showApiError(nextError, input.errorMessage);
        return false;
      }
    } finally {
      input.busy.value = false;
    }
  }

  return {
    runSaveAction,
  };
}
