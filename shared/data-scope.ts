export const DATA_SCOPE_TYPES = ['all', 'department', 'warehouse', 'department_warehouse'] as const;
export type DataScopeType = typeof DATA_SCOPE_TYPES[number];

export const PC_MONITOR_WAREHOUSE_SCOPE = '电脑仓+显示器仓';
export const PERMISSION_WAREHOUSE_OPTIONS = ['配件仓', '电脑仓', '显示器仓'] as const;
export type PermissionWarehouseScope = typeof PERMISSION_WAREHOUSE_OPTIONS[number];
export type ScopeMode = 'parts' | 'pc' | 'monitor';

const PC_MONITOR_ALIASES = [
  PC_MONITOR_WAREHOUSE_SCOPE,
  '电脑仓/显示器仓',
  '电脑/显示器仓',
  '显示器仓+电脑仓',
  '显示器仓/电脑仓',
] as const;

export function uniqueScopeValues<T extends string>(values: T[]) {
  return values.filter((item, index, arr) => item && arr.indexOf(item) === index);
}

export function readScopeStringList(value?: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  const raw = String(value || '').trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    } catch {}
  }
  if ((PC_MONITOR_ALIASES as readonly string[]).includes(raw)) return ['电脑仓', '显示器仓'];
  return raw.split(/[,\n，、]+/).map((item) => item.trim()).filter(Boolean);
}

export function normalizeWarehouseScopeValue(value?: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (['pc_monitor', 'pc+monitor', 'pc/monitor'].includes(lower)) return PC_MONITOR_WAREHOUSE_SCOPE;
  if ((PC_MONITOR_ALIASES as readonly string[]).includes(raw)) return PC_MONITOR_WAREHOUSE_SCOPE;
  if (['parts', 'part', '配件仓', '主仓'].includes(lower) || raw === '配件仓' || raw === '主仓') return '配件仓';
  if (['pc', '电脑仓'].includes(lower) || raw === '电脑仓') return '电脑仓';
  if (['monitor', '显示器仓'].includes(lower) || raw === '显示器仓') return '显示器仓';
  return raw.slice(0, 120);
}

export function normalizeWarehouseScopeValues(value?: unknown) {
  const values = readScopeStringList(value).flatMap((item) => {
    const normalized = normalizeWarehouseScopeValue(item);
    if (!normalized) return [];
    return normalized === PC_MONITOR_WAREHOUSE_SCOPE ? ['电脑仓', '显示器仓'] : [normalized];
  });
  return uniqueScopeValues(values);
}

export function permissionWarehouseScopeValues(value?: unknown) {
  return normalizeWarehouseScopeValues(value).filter((item): item is PermissionWarehouseScope => (
    PERMISSION_WAREHOUSE_OPTIONS as readonly string[]
  ).includes(item));
}

export function encodeWarehouseScopeValues(values: readonly unknown[]) {
  const normalized = uniqueScopeValues(values.map((item) => normalizeWarehouseScopeValue(item)).flatMap((item) => {
    if (!item) return [];
    return item === PC_MONITOR_WAREHOUSE_SCOPE ? ['电脑仓', '显示器仓'] : [item];
  }));
  return normalized.length ? JSON.stringify(normalized) : '';
}

export function isPermissionWarehouseScopeValue(value: string | null | undefined): value is PermissionWarehouseScope {
  return (PERMISSION_WAREHOUSE_OPTIONS as readonly string[]).includes(String(value || '').trim());
}
