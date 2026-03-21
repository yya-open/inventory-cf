import { apiGet } from './client';

type CacheEntry<T> = { expiresAt: number; value?: T; pending?: Promise<T> };
const cache = new Map<string, CacheEntry<any>>();

async function getWithCache<T>(key: string, ttlMs: number, loader: () => Promise<T>, force = false): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!force && hit?.value !== undefined && hit.expiresAt > now) return hit.value;
  if (!force && hit?.pending) return hit.pending;
  const pending = loader().then((value) => {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }).finally(() => {
    const latest = cache.get(key) as CacheEntry<T> | undefined;
    if (latest?.pending) latest.pending = undefined;
  });
  cache.set(key, { value: hit?.value, expiresAt: hit?.expiresAt || 0, pending });
  return pending;
}

export function getSystemPerformance(days = 7, options?: { force?: boolean }) {
  const key = `system-performance:${days}`;
  return getWithCache<any>(key, 30_000, () => apiGet(`/api/system-performance?days=${days}${options?.force ? '&force=1' : ''}`), options?.force);
}
