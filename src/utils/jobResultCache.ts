import { apiFetchFile, triggerFileDownload, type ApiFetchedFile } from '../api/client';

type CacheEntry = ApiFetchedFile & {
  cachedAt: number;
  lastAccessedAt: number;
};

type CachedResult = CacheEntry & {
  fromCache: boolean;
};

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 8;
const cache = new Map<string, CacheEntry>();

function now() {
  return Date.now();
}

function isFresh(entry?: CacheEntry | null) {
  return !!entry && (now() - entry.cachedAt) <= TTL_MS;
}

function pruneCache() {
  const entries = Array.from(cache.entries());
  for (const [key, entry] of entries) {
    if (!isFresh(entry)) cache.delete(key);
  }
  const remaining = Array.from(cache.entries());
  if (remaining.length <= MAX_ENTRIES) return;
  remaining
    .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
    .slice(0, Math.max(0, remaining.length - MAX_ENTRIES))
    .forEach(([key]) => cache.delete(key));
}

export async function getJobResultFileCached(path: string, filename?: string): Promise<CachedResult> {
  pruneCache();
  const hit = cache.get(path);
  if (hit && isFresh(hit)) {
    hit.lastAccessedAt = now();
    return { ...hit, fromCache: true };
  }
  const file = await apiFetchFile(path, filename);
  const entry: CacheEntry = {
    ...file,
    cachedAt: now(),
    lastAccessedAt: now(),
  };
  cache.set(path, entry);
  pruneCache();
  return { ...entry, fromCache: false };
}

export async function downloadJobResultCached(path: string, filename?: string) {
  const file = await getJobResultFileCached(path, filename);
  triggerFileDownload({ blob: file.blob, filename: file.filename, contentType: file.contentType }, filename || file.filename);
  return file;
}

export async function openJobResultCached(path: string, filename?: string) {
  const file = await getJobResultFileCached(path, filename);
  const url = URL.createObjectURL(file.blob);
  const tab = window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { ...file, windowRef: tab };
}

export function clearJobResultCache(path?: string) {
  if (!path) {
    cache.clear();
    return;
  }
  cache.delete(path);
}
