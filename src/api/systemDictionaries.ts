import { apiDelete, apiGet, apiPost, apiPut } from './client';

export type SystemDictionaryKey = 'asset_archive_reason' | 'department' | 'pc_brand' | 'monitor_brand';

export type SystemDictionaryItem = {
  id: number;
  dictionary_key: SystemDictionaryKey;
  label: string;
  normalized_label?: string;
  sort_order: number;
  enabled: number;
  reference_count: number;
  created_at?: string;
  updated_at?: string;
  updated_by?: string | null;
};

export type SystemDictionaryResponse = {
  items: SystemDictionaryItem[];
  grouped: Record<SystemDictionaryKey, SystemDictionaryItem[]>;
};

export async function fetchSystemDictionaries(dictionaryKey?: SystemDictionaryKey) {
  const query = dictionaryKey ? `?dictionary_key=${encodeURIComponent(dictionaryKey)}` : '';
  const result: any = await apiGet(`/api/system-dictionaries${query}`);
  return (result?.data || { items: [], grouped: {} }) as SystemDictionaryResponse;
}

export async function createSystemDictionaryItem(payload: Partial<SystemDictionaryItem>) {
  const result: any = await apiPost('/api/system-dictionaries', payload || {});
  return (result?.data || {}) as SystemDictionaryItem;
}

export async function updateSystemDictionaryItem(payload: Partial<SystemDictionaryItem>) {
  const result: any = await apiPut('/api/system-dictionaries', payload || {});
  return (result?.data || {}) as SystemDictionaryItem;
}

export async function deleteSystemDictionaryItem(id: number, updated_at?: string | null) {
  const result: any = await apiDelete('/api/system-dictionaries', { id, updated_at: updated_at || null, confirm: '删除' });
  return (result?.data || {}) as SystemDictionaryItem;
}


export async function reorderSystemDictionaryItems(dictionaryKey: SystemDictionaryKey, items: Array<Pick<SystemDictionaryItem, 'id' | 'sort_order' | 'updated_at'>>) {
  const result: any = await apiPut('/api/system-dictionaries', {
    action: 'reorder',
    dictionary_key: dictionaryKey,
    items: items.map((item: any) => ({ id: item.id, sort_order: item.sort_order, updated_at: item.updated_at || null })),
  });
  return (result?.data || { items: [], grouped: {} }) as SystemDictionaryResponse;
}

