export {
  DATA_SCOPE_TYPES,
  PC_MONITOR_WAREHOUSE_SCOPE,
  PERMISSION_WAREHOUSE_OPTIONS,
  encodeWarehouseScopeValues,
  isPermissionWarehouseScopeValue,
  normalizeWarehouseScopeValue,
  normalizeWarehouseScopeValues,
  permissionWarehouseScopeValues,
  readScopeStringList,
  uniqueScopeValues,
  type DataScopeType,
  type PermissionWarehouseScope,
  type ScopeMode,
} from '../../shared/data-scope';
import { encodeWarehouseScopeValues, permissionWarehouseScopeValues, type DataScopeType, type ScopeMode } from '../../shared/data-scope';

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

export function warehouseScopeValues(value?: unknown) {
  return permissionWarehouseScopeValues(value);
}

export function normalizeDataScope(type?: string | null, value?: string | null, value2?: string | null) {
  const rawType = String(type || '').trim().toLowerCase();
  const department = normalizeDepartment(value);
  const warehouseSource = rawType === 'department_warehouse' ? value2 : (value || value2);
  const warehouses = warehouseScopeValues(warehouseSource);
  const warehouse = warehouses.length ? encodeWarehouseScopeValues(warehouses) : '';
  if (rawType === 'department' && department) return { data_scope_type: 'department' as const, data_scope_value: department, data_scope_value2: '' };
  if (rawType === 'warehouse' && warehouse) return { data_scope_type: 'warehouse' as const, data_scope_value: warehouse, data_scope_value2: '' };
  if (rawType === 'department_warehouse' && department && warehouse) return { data_scope_type: 'department_warehouse' as const, data_scope_value: department, data_scope_value2: warehouse };
  return { data_scope_type: 'all' as const, data_scope_value: '', data_scope_value2: '' };
}

export function dataScopeLabel(type?: string | null, value?: string | null, value2?: string | null) {
  const normalized = normalizeDataScope(type, value, value2);
  if (normalized.data_scope_type === 'department') return `部门：${normalized.data_scope_value}`;
  if (normalized.data_scope_type === 'warehouse') return `仓库：${warehouseScopeValues(normalized.data_scope_value).join('、')}`;
  if (normalized.data_scope_type === 'department_warehouse') return `部门：${normalized.data_scope_value} / 仓库：${warehouseScopeValues(normalized.data_scope_value2).join('、')}`;
  return '全部数据';
}

export function scopeModeOptions(type?: string | null, value?: string | null, value2?: string | null) {
  const normalized = normalizeDataScope(type, value, value2);
  if (normalized.data_scope_type === 'department') return ['pc', 'monitor'] as ScopeMode[];
  if (normalized.data_scope_type === 'warehouse' || normalized.data_scope_type === 'department_warehouse') {
    const warehouses = warehouseScopeValues(normalized.data_scope_type === 'warehouse' ? normalized.data_scope_value : normalized.data_scope_value2);
    const modes: ScopeMode[] = [];
    if (warehouses.includes('配件仓')) modes.push('parts');
    if (warehouses.includes('电脑仓')) modes.push('pc');
    if (warehouses.includes('显示器仓')) modes.push('monitor');
    return modes;
  }
  return ['parts', 'pc', 'monitor'] as ScopeMode[];
}
