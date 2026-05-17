import { z } from 'zod';

function trimToMaxLen(maxLen: number) {
  return z.preprocess((value) => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen) : text;
  }, z.string());
}

function requiredText(fieldName: string, maxLen: number) {
  return trimToMaxLen(maxLen).refine((value) => value.length > 0, { message: `${fieldName} 必填` });
}

function optionalText(maxLen: number) {
  return trimToMaxLen(maxLen).transform((value) => (value ? value : null));
}

const locationIdSchema = z.preprocess((value) => {
  const num = Number(value || 0);
  return Number.isFinite(num) && num > 0 ? num : null;
}, z.number().nullable());

export const monitorAssetInputSchema = z.object({
  asset_code: requiredText('资产编号', 120),
  sn: optionalText(120),
  brand: optionalText(120),
  model: optionalText(200),
  size_inch: optionalText(60),
  remark: optionalText(1000),
  location_id: locationIdSchema,
});

export type MonitorAssetInput = z.infer<typeof monitorAssetInputSchema>;

export function parseMonitorAssetInput(body: unknown): MonitorAssetInput {
  const result = monitorAssetInputSchema.safeParse(body ?? {});
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue?.message || '入参格式有误';
    const err: any = new Error(message);
    err.status = 400;
    throw err;
  }
  return result.data;
}
