export const DATA_SCOPE_OPTIONS = [
    { value: 'all', label: '全部数据' },
    { value: 'department', label: '按部门可见' },
    { value: 'warehouse', label: '按仓库可见' },
    { value: 'department_warehouse', label: '按部门+仓库可见' },
];
function normalizeDepartment(value) {
    const raw = String(value || '').trim();
    return raw || '';
}
function normalizeWarehouse(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    if (['pc', '电脑仓'].includes(raw.toLowerCase()) || raw === '电脑仓')
        return '电脑仓';
    if (['monitor', '显示器仓'].includes(raw.toLowerCase()) || raw === '显示器仓')
        return '显示器仓';
    if (['parts', 'part', '配件仓', '主仓'].includes(raw.toLowerCase()) || raw === '配件仓' || raw === '主仓')
        return '配件仓';
    return raw;
}
export function normalizeDataScope(type, value, value2) {
    const rawType = String(type || '').trim().toLowerCase();
    const department = normalizeDepartment(value);
    const warehouseSource = rawType === 'department_warehouse' ? value2 : (value || value2);
    const warehouse = normalizeWarehouse(warehouseSource);
    if (rawType === 'department' && department)
        return { data_scope_type: 'department', data_scope_value: department, data_scope_value2: '' };
    if (rawType === 'warehouse' && warehouse)
        return { data_scope_type: 'warehouse', data_scope_value: warehouse, data_scope_value2: '' };
    if (rawType === 'department_warehouse' && department && warehouse)
        return { data_scope_type: 'department_warehouse', data_scope_value: department, data_scope_value2: warehouse };
    return { data_scope_type: 'all', data_scope_value: '', data_scope_value2: '' };
}
export function dataScopeLabel(type, value, value2) {
    const normalized = normalizeDataScope(type, value, value2);
    if (normalized.data_scope_type === 'department')
        return `部门：${normalized.data_scope_value}`;
    if (normalized.data_scope_type === 'warehouse')
        return `仓库：${normalized.data_scope_value}`;
    if (normalized.data_scope_type === 'department_warehouse')
        return `部门：${normalized.data_scope_value} / 仓库：${normalized.data_scope_value2}`;
    return '全部数据';
}
export function scopeModeOptions(type, value, value2) {
    const normalized = normalizeDataScope(type, value, value2);
    if (normalized.data_scope_type === 'department')
        return ['pc', 'monitor'];
    if (normalized.data_scope_type === 'warehouse') {
        if (normalized.data_scope_value === '配件仓')
            return ['parts'];
        if (normalized.data_scope_value === '电脑仓')
            return ['pc'];
        if (normalized.data_scope_value === '显示器仓')
            return ['monitor'];
        return [];
    }
    if (normalized.data_scope_type === 'department_warehouse') {
        if (normalized.data_scope_value2 === '配件仓')
            return ['parts'];
        if (normalized.data_scope_value2 === '电脑仓')
            return ['pc'];
        if (normalized.data_scope_value2 === '显示器仓')
            return ['monitor'];
        return [];
    }
    return ['parts', 'pc', 'monitor'];
}
