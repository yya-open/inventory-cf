import { normalizeDepartmentScopeValue, normalizeWarehouseScopeValue } from './data-scope';
import { getEnabledDictionaryLabels, type SystemDictionaryKey } from './system-dictionaries';

function normalizeText(value: any) {
  return String(value || '').trim();
}

function normalizeComparable(value: any) {
  return normalizeText(value).toLowerCase();
}

async function assertDictionaryValue(
  db: D1Database,
  key: SystemDictionaryKey,
  value: any,
  label: string,
  options?: { allowEmpty?: boolean; normalizedValue?: string | null },
) {
  const normalized = normalizeText(options?.normalizedValue ?? value);
  if (!normalized) {
    if (options?.allowEmpty) return null;
    throw Object.assign(new Error(`${label}不能为空`), { status: 400 });
  }
  const labels = await getEnabledDictionaryLabels(db, key);
  const allowed = new Set((labels || []).map((item) => normalizeComparable(item)).filter(Boolean));
  if (!allowed.has(normalizeComparable(normalized))) {
    throw Object.assign(new Error(`${label}未纳入系统字典，请先到系统配置中维护后再使用`), { status: 400 });
  }
  return normalized;
}

export async function assertDepartmentDictionaryValue(db: D1Database, value: any, label = '部门', options?: { allowEmpty?: boolean }) {
  const normalized = normalizeDepartmentScopeValue(value);
  return assertDictionaryValue(db, 'department', normalized, label, { allowEmpty: options?.allowEmpty, normalizedValue: normalized });
}

export async function assertWarehouseDictionaryValue(db: D1Database, value: any, label = '仓库', options?: { allowEmpty?: boolean }) {
  const normalized = normalizeWarehouseScopeValue(value);
  return assertDictionaryValue(db, 'asset_warehouse', normalized, label, { allowEmpty: options?.allowEmpty, normalizedValue: normalized });
}

export async function assertPcBrandDictionaryValue(db: D1Database, value: any, label = '品牌') {
  const normalized = normalizeText(value);
  return assertDictionaryValue(db, 'pc_brand', normalized, label, { normalizedValue: normalized });
}

export async function assertMonitorBrandDictionaryValue(db: D1Database, value: any, label = '品牌', options?: { allowEmpty?: boolean }) {
  const normalized = normalizeText(value);
  return assertDictionaryValue(db, 'monitor_brand', normalized, label, { allowEmpty: options?.allowEmpty, normalizedValue: normalized });
}

export async function assertArchiveReasonDictionaryValue(db: D1Database, value: any, label = '归档原因', options?: { allowEmpty?: boolean }) {
  const normalized = normalizeText(value);
  return assertDictionaryValue(db, 'asset_archive_reason', normalized, label, { allowEmpty: options?.allowEmpty, normalizedValue: normalized });
}
