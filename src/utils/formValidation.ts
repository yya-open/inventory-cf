import type { FormInstance } from 'element-plus';

type ValidationMessageMap = Record<string, string>;

export async function validateWithFriendlyMessage(
  form: FormInstance | undefined,
  onWarning: (message: string) => void,
  fieldMessages: ValidationMessageMap,
  fallbackMessage = '请先完善表单必填项',
) {
  if (!form) {
    onWarning(fallbackMessage);
    return false;
  }

  try {
    await form.validate();
    return true;
  } catch (err: any) {
    const fields = err && typeof err === 'object' ? err : null;
    for (const key of Object.keys(fieldMessages)) {
      if ((fields as any)?.[key]?.length) {
        onWarning(fieldMessages[key]);
        return false;
      }
    }
    onWarning(fallbackMessage);
    return false;
  }
}
