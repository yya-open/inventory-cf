export type HitokotoCacheEntry = {
  text: string;
  from: string;
  updatedAt: number;
};

const HITOKOTO_CACHE_KEY = 'inventory:login-hitokoto';

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readHitokotoCache(maxAgeMs: number) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(HITOKOTO_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as HitokotoCacheEntry;
    if (!data?.text || !data?.updatedAt) return null;
    const age = Date.now() - Number(data.updatedAt || 0);
    return { ...data, fresh: age >= 0 && age <= maxAgeMs };
  } catch {
    return null;
  }
}

export function writeHitokotoCache(entry: { text: string; from: string }) {
  const storage = getStorage();
  if (!storage || !entry?.text) return;
  try {
    storage.setItem(HITOKOTO_CACHE_KEY, JSON.stringify({
      text: String(entry.text || ''),
      from: String(entry.from || ''),
      updatedAt: Date.now(),
    } satisfies HitokotoCacheEntry));
  } catch {}
}
