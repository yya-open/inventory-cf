const ASSET_LIST_CACHE_TTL_MS = 30_000;

const assetListCache = new Map<string, { expiresAt: number; payload: any }>();
const assetListPending = new Map<string, Promise<any>>();
const assetListVersions = new Map<string, number>();

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
  for (const key of assetListCache.keys()) {
    if (key.startsWith(prefix)) assetListCache.delete(key);
  }
  for (const key of assetListPending.keys()) {
    if (key.startsWith(prefix)) assetListPending.delete(key);
  }
}
