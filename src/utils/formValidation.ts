import type { FormInstance } from 'element-plus';

type ValidationMessageMap = Record<string, string>;

export async function validateWithFriendlyMessage(
  form: FormInstance | undefined,
  onWarning: (message: string) => void,
  fieldMessages: ValidationMessageMap,
  fallbackMessage = '请先完善表单必填项',
) {
  return await new Promise<boolean>((resolve) => {
    if (!form) {
      onWarning(fallbackMessage);
      resolve(false);
      return;
    }
    form.validate((valid, fields) => {
      if (!valid) {
        for (const key of Object.keys(fieldMessages)) {
          if ((fields as any)?.[key]?.length) {
            onWarning(fieldMessages[key]);
            resolve(false);
            return;
          }
        }
        onWarning(fallbackMessage);
      }
      resolve(Boolean(valid));
    });
  });
}
