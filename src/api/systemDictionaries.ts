import { apiDelete, apiGet, apiPost, apiPut } from './client';

export type SystemDictionaryKey = 'asset_archive_reason' | 'pc_brand' | 'monitor_brand' | 'asset_warehouse';

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

const DICT_CACHE_TTL_MS = 5 * 60_000;
type DictCacheEntry = { expiresAt: number; value?: SystemDictionaryResponse; pending?: Promise<SystemDictionaryResponse> };
const dictCache = new Map<string, DictCacheEntry>();

function invalidateDictionaryClientCache(dictionaryKey?: SystemDictionaryKey) {
  if (dictionaryKey) dictCache.delete(dictionaryKey);
  dictCache.delete('__all__');
}

export async function fetchSystemDictionaries(dictionaryKey?: SystemDictionaryKey, options?: { force?: boolean }) {
  const key = dictionaryKey || '__all__';
  const force = !!options?.force;
  const now = Date.now();
  const hit = dictCache.get(key);
  if (!force && hit?.value && hit.expiresAt > now) return hit.value;
  if (!force && hit?.pending) return hit.pending;
  const query = dictionaryKey ? `?dictionary_key=${encodeURIComponent(dictionaryKey)}` : '';
  const pending = apiGet(`/api/system-dictionaries${query}`).then((result: any) => {
    const value = (result?.data || { items: [], grouped: {} }) as SystemDictionaryResponse;
    dictCache.set(key, { value, expiresAt: Date.now() + DICT_CACHE_TTL_MS });
    return value;
  }).finally(() => {
    const latest = dictCache.get(key);
    if (latest?.pending) latest.pending = undefined;
  });
  dictCache.set(key, { value: hit?.value, expiresAt: hit?.expiresAt || 0, pending });
  return pending;
}

export async function createSystemDictionaryItem(payload: Partial<SystemDictionaryItem>) {
  const result: any = await apiPost('/api/system-dictionaries', payload || {});
  const item = (result?.data || {}) as SystemDictionaryItem;
  invalidateDictionaryClientCache(item?.dictionary_key || payload?.dictionary_key);
  return item;
}

export async function updateSystemDictionaryItem(payload: Partial<SystemDictionaryItem>) {
  const result: any = await apiPut('/api/system-dictionaries', payload || {});
  const item = (result?.data || {}) as SystemDictionaryItem;
  invalidateDictionaryClientCache(item?.dictionary_key || payload?.dictionary_key);
  return item;
}

export async function deleteSystemDictionaryItem(id: number, updated_at?: string | null) {
  const result: any = await apiDelete('/api/system-dictionaries', { id, updated_at: updated_at || null, confirm: '删除' });
  const item = (result?.data || {}) as SystemDictionaryItem;
  invalidateDictionaryClientCache(item?.dictionary_key);
  return item;
}


export async function reorderSystemDictionaryItems(dictionaryKey: SystemDictionaryKey, items: Array<Pick<SystemDictionaryItem, 'id' | 'sort_order' | 'updated_at'>>) {
  const result: any = await apiPut('/api/system-dictionaries', {
    action: 'reorder',
    dictionary_key: dictionaryKey,
    items: items.map((item: any) => ({ id: item.id, sort_order: item.sort_order, updated_at: item.updated_at || null })),
  });
  const value = (result?.data || { items: [], grouped: {} }) as SystemDictionaryResponse;
  invalidateDictionaryClientCache(dictionaryKey);
  return value;
}

