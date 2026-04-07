import { getSystemSettings } from './system-settings';

const DEFAULT_EMPLOYEE_NO_PATTERN = '^[A-Za-z0-9_-]{3,32}$';

export async function getDataQualitySettings(db: D1Database) {
  const settings = await getSystemSettings(db);
  return {
    employeeNoPattern: String(settings.validation_employee_no_pattern || DEFAULT_EMPLOYEE_NO_PATTERN).trim() || DEFAULT_EMPLOYEE_NO_PATTERN,
    serialUppercase: Boolean(settings.validation_serial_no_uppercase),
    remarkMaxLength: Math.max(50, Math.min(2000, Number(settings.validation_remark_max_length || 500))),
  };
}

export function normalizeSerialNoByRule(input: any, uppercase = true) {
  const value = String(input || '').trim().replace(/\s+/g, '');
  return uppercase ? value.toUpperCase() : value;
}

export function trimRemarkByRule(input: any, maxLength = 500) {
  return String(input || '').trim().replace(/\s+/g, ' ').slice(0, Math.max(0, maxLength));
}

export function assertEmployeeNo(input: any, pattern = DEFAULT_EMPLOYEE_NO_PATTERN) {
  const value = String(input || '').trim();
  if (!value) throw Object.assign(new Error('员工工号不能为空'), { status: 400 });
  try {
    const reg = new RegExp(pattern || DEFAULT_EMPLOYEE_NO_PATTERN);
    if (!reg.test(value)) throw Object.assign(new Error('员工工号格式不正确'), { status: 400 });
  } catch (error: any) {
    if (error?.message === '员工工号格式不正确') throw error;
    if (!new RegExp(DEFAULT_EMPLOYEE_NO_PATTERN).test(value)) throw Object.assign(new Error('员工工号格式不正确'), { status: 400 });
  }
  return value;
}

export function assertDateText(input: any, label: string) {
  const value = String(input || '').trim();
  if (!value) return value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Object.assign(new Error(`${label}格式应为 YYYY-MM-DD`), { status: 400 });
  return value;
}
