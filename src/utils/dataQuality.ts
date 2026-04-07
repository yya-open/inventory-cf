export type DataQualitySettings = {
  validation_employee_no_pattern?: string;
  validation_serial_no_uppercase?: boolean;
  validation_remark_max_length?: number;
};

export const DEFAULT_EMPLOYEE_NO_PATTERN = '^[A-Za-z0-9_-]{3,32}$';

export function normalizeSerialNo(input: any, uppercase = true) {
  const value = String(input || '').trim().replace(/\s+/g, '');
  return uppercase ? value.toUpperCase() : value;
}

export function normalizeRemark(input: any, maxLength = 500) {
  return String(input || '').trim().replace(/\s+/g, ' ').slice(0, Math.max(0, maxLength));
}

export function validateEmployeeNo(input: any, pattern = DEFAULT_EMPLOYEE_NO_PATTERN) {
  const value = String(input || '').trim();
  if (!value) return '员工工号不能为空';
  try {
    const reg = new RegExp(pattern || DEFAULT_EMPLOYEE_NO_PATTERN);
    if (!reg.test(value)) return '员工工号格式不正确';
  } catch {
    if (!new RegExp(DEFAULT_EMPLOYEE_NO_PATTERN).test(value)) return '员工工号格式不正确';
  }
  return '';
}

export function validateDateText(input: any, label: string) {
  const value = String(input || '').trim();
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${label}格式应为 YYYY-MM-DD`;
  return '';
}

export function summarizeValidationErrors(errors: string[], limit = 4) {
  const deduped = Array.from(new Set(errors.filter(Boolean)));
  if (!deduped.length) return '';
  const head = deduped.slice(0, limit).join('；');
  return deduped.length > limit ? `${head} 等 ${deduped.length} 项问题` : head;
}
