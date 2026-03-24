export type AssetQrCacheKind = "pc" | "monitor";

export type AssetQrCacheEntry = {
  link: string;
  dataUrl: string;
  svgMarkup: string;
  version: string;
  cachedAt: number;
};

const qrCache = new Map<string, AssetQrCacheEntry>();
const MAX_CACHE_SIZE = 160;

function buildCacheKey(kind: AssetQrCacheKind, id: number, version: string) {
  return `${kind}:${id}:${String(version || "") || "-"}`;
}

function trimCache() {
  if (qrCache.size <= MAX_CACHE_SIZE) return;
  const overflow = qrCache.size - MAX_CACHE_SIZE;
  const entries = Array.from(qrCache.entries()).sort((a, b) => a[1].cachedAt - b[1].cachedAt);
  for (const [key] of entries.slice(0, overflow)) qrCache.delete(key);
}

export function getCachedAssetQr(kind: AssetQrCacheKind, id: number, version: string) {
  if (!Number.isFinite(id) || id <= 0) return null;
  return qrCache.get(buildCacheKey(kind, id, version)) || null;
}

export function setCachedAssetQr(kind: AssetQrCacheKind, id: number, version: string, value: { link: string; dataUrl: string; svgMarkup?: string }) {
  if (!Number.isFinite(id) || id <= 0 || !value?.link || !value?.dataUrl) return;
  qrCache.set(buildCacheKey(kind, id, version), {
    link: String(value.link || ''),
    dataUrl: String(value.dataUrl || ''),
    svgMarkup: String(value.svgMarkup || ''),
    version: String(version || ''),
    cachedAt: Date.now(),
  });
  trimCache();
}

export function invalidateAssetQr(kind: AssetQrCacheKind, id: number) {
  if (!Number.isFinite(id) || id <= 0) return;
  const prefix = `${kind}:${id}:`;
  for (const key of Array.from(qrCache.keys())) {
    if (key.startsWith(prefix)) qrCache.delete(key);
  }
}
