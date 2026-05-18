const ASSET_LIST_CACHE_TTL_MS = 30_000;
const ASSET_LIST_CACHE_MAX_SIZE = 50;

const assetListCache = new Map<string, { expiresAt: number; payload: any }>();
const assetListPending = new Map<string, Promise<any>>();
const assetListVersions = new Map<string, number>();

function evictExpiredEntries() {
  if (assetListCache.size <= ASSET_LIST_CACHE_MAX_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of assetListCache) {
    if (entry.expiresAt <= now) assetListCache.delete(key);
  }
  if (assetListCache.size <= ASSET_LIST_CACHE_MAX_SIZE) {
    return;
  }
  const oldest = [...assetListCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const toRemove = oldest.slice(0, oldest.length - ASSET_LIST_CACHE_MAX_SIZE);
  for (const [key] of toRemove) assetListCache.delete(key);
}

export function buildAssetListCacheKey(namespace: string, user: any, url: URL) {
  return [
    String(namespace || 'assets'),
    String(user?.id || 0),
    String(user?.role || ''),
    String(user?.data_scope_type || ''),
    String(user?.data_scope_value || ''),
    String(user?.data_scope_value2 || ''),
    url.searchParams.toString(),
  ].join('::');
}

export function readAssetListCache(key: string) {
  const hit = assetListCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    assetListCache.delete(key);
    return null;
  }
  return hit.payload;
}

export function getAssetListCacheVersion(namespace: string) {
  return Number(assetListVersions.get(String(namespace || 'assets')) || 0);
}

export function writeAssetListCache(key: string, payload: any, namespace?: string, version?: number) {
  if (namespace && typeof version === 'number' && getAssetListCacheVersion(namespace) !== version) {
    return payload;
  }
  assetListCache.set(key, { expiresAt: Date.now() + ASSET_LIST_CACHE_TTL_MS, payload });
  evictExpiredEntries();
  return payload;
}

export function getPendingAssetListRequest(key: string) {
  return assetListPending.get(key) || null;
}

export function setPendingAssetListRequest(key: string, task: Promise<any>) {
  assetListPending.set(key, task);
}

export function clearPendingAssetListRequest(key: string, task: Promise<any>) {
  if (assetListPending.get(key) === task) assetListPending.delete(key);
}

export function invalidateAssetListCache(namespace?: string) {
  if (!namespace) {
    assetListCache.clear();
    assetListPending.clear();
    assetListVersions.clear();
    return;
  }
  assetListVersions.set(namespace, getAssetListCacheVersion(namespace) + 1);
  const prefix = `${namespace}::`;
  for (const key of [...assetListCache.keys(), ...assetListPending.keys()]) {
    if (key.startsWith(prefix)) {
      assetListCache.delete(key);
      assetListPending.delete(key);
    }
  }
}
