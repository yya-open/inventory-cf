import { apiGet } from './client';

type CacheEntry<T> = { expiresAt: number; value?: T; pending?: Promise<T> };

const caches = new Map<string, CacheEntry<any>>();

async function getWithCache<T>(key: string, ttlMs: number, loader: () => Promise<T>, force = false): Promise<T> {
  const now = Date.now();
  const hit = caches.get(key) as CacheEntry<T> | undefined;
  if (!force && hit?.value !== undefined && hit.expiresAt > now) return hit.value;
  if (!force && hit?.pending) return hit.pending;
  const pending = loader().then((value) => {
    caches.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }).finally(() => {
    const latest = caches.get(key) as CacheEntry<T> | undefined;
    if (latest?.pending) latest.pending = undefined;
  });
  caches.set(key, { value: hit?.value, expiresAt: hit?.expiresAt || 0, pending });
  return pending;
}

export function invalidateSystemCaches() {
  caches.clear();
}

export function getSystemHealth(options?: { force?: boolean }) {
  return getWithCache<any>('system-health', 180_000, () => apiGet(options?.force ? '/api/system-health?force=1' : '/api/system-health'), options?.force);
}

export function getSystemSchemaStatus(options?: { force?: boolean }) {
  return getWithCache<any>('system-schema-status', 60_000, () => apiGet(options?.force ? '/api/system-schema-status?force=1' : '/api/system-schema-status'), options?.force);
}
