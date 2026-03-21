export type DataScopeType = 'all' | 'department' | 'warehouse' | 'department_warehouse';

export const DATA_SCOPE_OPTIONS: Array<{ value: DataScopeType; label: string }> = [
  { value: 'all', label: '全部数据' },
  { value: 'department', label: '按部门可见' },
  { value: 'warehouse', label: '按仓库可见' },
  { value: 'department_warehouse', label: '按部门+仓库可见' },
];

function normalizeDepartment(value?: string | null) {
  const raw = String(value || '').trim();
  return raw || '';
}

function normalizeWarehouse(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (['pc', '电脑仓'].includes(raw.toLowerCase()) || raw === '电脑仓') return '电脑仓';
  if (['monitor', '显示器仓'].includes(raw.toLowerCase()) || raw === '显示器仓') return '显示器仓';
  if (['parts', 'part', '配件仓', '主仓'].includes(raw.toLowerCase()) || raw === '配件仓' || raw === '主仓') return '配件仓';
  return raw;
}

export function normalizeDataScope(type?: string | null, value?: string | null, value2?: string | null) {
  const rawType = String(type || '').trim().toLowerCase();
  const department = normalizeDepartment(value);
  const warehouse = normalizeWarehouse(value2 ?? value);
  if (rawType === 'department' && department) return { data_scope_type: 'department' as const, data_scope_value: department, data_scope_value2: '' };
  if (rawType === 'warehouse' && warehouse) return { data_scope_type: 'warehouse' as const, data_scope_value: warehouse, data_scope_value2: '' };
  if (rawType === 'department_warehouse' && department && warehouse) return { data_scope_type: 'department_warehouse' as const, data_scope_value: department, data_scope_value2: warehouse };
  return { data_scope_type: 'all' as const, data_scope_value: '', data_scope_value2: '' };
}

export function dataScopeLabel(type?: string | null, value?: string | null, value2?: string | null) {
  const normalized = normalizeDataScope(type, value, value2);
  if (normalized.data_scope_type === 'department') return `部门：${normalized.data_scope_value}`;
  if (normalized.data_scope_type === 'warehouse') return `仓库：${normalized.data_scope_value}`;
  if (normalized.data_scope_type === 'department_warehouse') return `部门：${normalized.data_scope_value} / 仓库：${normalized.data_scope_value2}`;
  return '全部数据';
}

export function scopeModeOptions(type?: string | null, value?: string | null, value2?: string | null) {
  const normalized = normalizeDataScope(type, value, value2);
  if (normalized.data_scope_type === 'department') return ['pc'] as const;
  if (normalized.data_scope_type === 'warehouse') {
    if (normalized.data_scope_value === '配件仓') return ['parts'] as const;
    if (normalized.data_scope_value === '电脑仓') return ['pc'] as const;
    return [] as const;
  }
  if (normalized.data_scope_type === 'department_warehouse') {
    if (normalized.data_scope_value2 === '配件仓') return ['parts'] as const;
    if (normalized.data_scope_value2 === '电脑仓') return ['pc'] as const;
    return [] as const;
  }
  return ['parts', 'pc'] as const;
}
