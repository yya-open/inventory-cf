export type DataScopeType = 'all' | 'department';

export const DATA_SCOPE_OPTIONS: Array<{ value: DataScopeType; label: string }> = [
  { value: 'all', label: '全部数据' },
  { value: 'department', label: '按部门可见' },
];

export function normalizeDataScope(type?: string | null, value?: string | null) {
  const rawType = String(type || '').trim().toLowerCase();
  const rawValue = String(value || '').trim();
  if (rawType === 'department' && rawValue) return { data_scope_type: 'department' as const, data_scope_value: rawValue };
  return { data_scope_type: 'all' as const, data_scope_value: '' };
}

export function dataScopeLabel(type?: string | null, value?: string | null) {
  const normalized = normalizeDataScope(type, value);
  if (normalized.data_scope_type === 'department') return `部门：${normalized.data_scope_value}`;
  return '全部数据';
}
