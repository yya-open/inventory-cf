type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  pending?: Promise<T>;
};

const store = new Map<string, CacheEntry<any>>();

export async function getCachedResource<T>(key: string, loader: () => Promise<T>, options?: { ttlMs?: number; force?: boolean }) {
  const ttlMs = Math.max(0, Number(options?.ttlMs ?? 10_000) || 0);
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!options?.force && entry?.value !== undefined && entry.expiresAt > now) return entry.value;
  if (!options?.force && entry?.pending) return entry.pending;
  const pending = loader().then((value) => {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }).finally(() => {
    const latest = store.get(key);
    if (latest?.pending === pending) store.set(key, { value: latest.value, expiresAt: latest.expiresAt });
  });
  store.set(key, { value: entry?.value, expiresAt: entry?.expiresAt || 0, pending });
  return pending;
}

export function setCachedResource<T>(key: string, value: T, ttlMs = 10_000) {
  store.set(key, { value, expiresAt: Date.now() + Math.max(0, Number(ttlMs) || 0) });
  return value;
}

export function invalidateCachedResource(keyPrefix: string) {
  for (const key of [...store.keys()]) {
    if (key === keyPrefix || key.startsWith(`${keyPrefix}::`)) store.delete(key);
  }
}
