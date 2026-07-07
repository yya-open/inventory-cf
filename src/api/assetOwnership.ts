import { apiGetData } from './client';
import { asArray, asNumber, asObject, asString } from './schema';

export type AssetOwnershipKind = 'all' | 'pc' | 'monitor';
export type AssetOwnershipGroupBy = 'person' | 'department';

export type AssetOwnershipAsset = {
  kind: 'pc' | 'monitor';
  id: number;
  asset_code: string;
  serial_no?: string | null;
  brand?: string | null;
  model?: string | null;
  status?: string | null;
  employee_no?: string | null;
  employee_name?: string | null;
  department?: string | null;
  assigned_at?: string | null;
  location_name?: string | null;
  parent_location_name?: string | null;
  inventory_status?: string | null;
  inventory_at?: string | null;
};

export type AssetOwnershipGroup = {
  key: string;
  label: string;
  employee_no?: string | null;
  employee_name?: string | null;
  department?: string | null;
  pc_count: number;
  monitor_count: number;
  total: number;
  assets: AssetOwnershipAsset[];
};

export type AssetOwnershipOverview = {
  group_by: AssetOwnershipGroupBy;
  kind: AssetOwnershipKind;
  keyword: string;
  groups: AssetOwnershipGroup[];
  assets: AssetOwnershipAsset[];
  summary: { groups: number; total: number; pc: number; monitor: number };
};

export type AssetLifecycleEvent = {
  id: string;
  kind: 'pc' | 'monitor';
  asset_id: number;
  category: 'asset' | 'movement' | 'inventory' | 'archive';
  action: string;
  title: string;
  occurred_at?: string | null;
  created_by?: string | null;
  reference_no?: string | null;
  employee_no?: string | null;
  employee_name?: string | null;
  department?: string | null;
  location_name?: string | null;
  from_location_name?: string | null;
  to_location_name?: string | null;
  remark?: string | null;
  status?: string | null;
  issue_type?: string | null;
};

export type AssetLifecyclePayload = {
  asset: Record<string, any> | null;
  events: AssetLifecycleEvent[];
};

function toQueryString(params: Record<string, string | number | undefined | null>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    qs.set(key, String(value));
  });
  return qs.toString();
}

function parseAsset(input: unknown): AssetOwnershipAsset {
  const row = asObject(input || {}, '资产');
  return {
    kind: asString(row.kind, 'pc') === 'monitor' ? 'monitor' : 'pc',
    id: asNumber(row.id, 0),
    asset_code: asString(row.asset_code, ''),
    serial_no: asString(row.serial_no, ''),
    brand: asString(row.brand, ''),
    model: asString(row.model, ''),
    status: asString(row.status, ''),
    employee_no: asString(row.employee_no, ''),
    employee_name: asString(row.employee_name, ''),
    department: asString(row.department, ''),
    assigned_at: asString(row.assigned_at, ''),
    location_name: asString(row.location_name, ''),
    parent_location_name: asString(row.parent_location_name, ''),
    inventory_status: asString(row.inventory_status, ''),
    inventory_at: asString(row.inventory_at, ''),
  };
}

function parseEvent(input: unknown): AssetLifecycleEvent {
  const row = asObject(input || {}, '生命周期事件');
  const category = asString(row.category, 'asset');
  return {
    id: asString(row.id, ''),
    kind: asString(row.kind, 'pc') === 'monitor' ? 'monitor' : 'pc',
    asset_id: asNumber(row.asset_id, 0),
    category: ['asset', 'movement', 'inventory', 'archive'].includes(category) ? category as AssetLifecycleEvent['category'] : 'asset',
    action: asString(row.action, ''),
    title: asString(row.title, ''),
    occurred_at: asString(row.occurred_at, ''),
    created_by: asString(row.created_by, ''),
    reference_no: asString(row.reference_no, ''),
    employee_no: asString(row.employee_no, ''),
    employee_name: asString(row.employee_name, ''),
    department: asString(row.department, ''),
    location_name: asString(row.location_name, ''),
    from_location_name: asString(row.from_location_name, ''),
    to_location_name: asString(row.to_location_name, ''),
    remark: asString(row.remark, ''),
    status: asString(row.status, ''),
    issue_type: asString(row.issue_type, ''),
  };
}

export function getAssetOwnershipOverview(params: {
  groupBy: AssetOwnershipGroupBy;
  kind: AssetOwnershipKind;
  keyword?: string;
  limit?: number;
}, signal?: AbortSignal) {
  const query = toQueryString({
    group_by: params.groupBy,
    kind: params.kind === 'all' ? undefined : params.kind,
    keyword: params.keyword,
    limit: params.limit,
  });
  return apiGetData(`/api/asset-ownership-overview?${query}`, (input) => {
    const row = asObject(input || {}, '人员/部门资产视图');
    return {
      group_by: asString(row.group_by, 'person') === 'department' ? 'department' : 'person',
      kind: asString(row.kind, 'all') as AssetOwnershipKind,
      keyword: asString(row.keyword, ''),
      groups: asArray(row.groups || [], (item) => {
        const group = asObject(item, '资产分组');
        return {
          key: asString(group.key, ''),
          label: asString(group.label, ''),
          employee_no: asString(group.employee_no, ''),
          employee_name: asString(group.employee_name, ''),
          department: asString(group.department, ''),
          pc_count: asNumber(group.pc_count, 0),
          monitor_count: asNumber(group.monitor_count, 0),
          total: asNumber(group.total, 0),
          assets: asArray(group.assets || [], parseAsset, '资产列表'),
        } satisfies AssetOwnershipGroup;
      }, '资产分组列表'),
      assets: asArray(row.assets || [], parseAsset, '资产列表'),
      summary: {
        groups: asNumber((row.summary as any)?.groups, 0),
        total: asNumber((row.summary as any)?.total, 0),
        pc: asNumber((row.summary as any)?.pc, 0),
        monitor: asNumber((row.summary as any)?.monitor, 0),
      },
    } satisfies AssetOwnershipOverview;
  }, { signal });
}

export function getAssetLifecycle(kind: 'pc' | 'monitor', id: number, signal?: AbortSignal) {
  const query = toQueryString({ kind, id });
  return apiGetData(`/api/asset-lifecycle?${query}`, (input) => {
    const row = asObject(input || {}, '资产生命周期');
    return {
      asset: (row.asset && typeof row.asset === 'object') ? row.asset as Record<string, any> : null,
      events: asArray(row.events || [], parseEvent, '生命周期事件列表'),
    } satisfies AssetLifecyclePayload;
  }, { signal });
}
