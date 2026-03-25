const prefetchedChunks = new Set<string>();

function getConnection() {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string; downlink?: number };
  }).connection || null;
}

export function shouldAllowRoutePrefetch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (document.visibilityState === 'hidden') return false;
  const connection = getConnection();
  if (!connection) return true;
  if (connection.saveData) return false;
  if (connection.effectiveType && /(^|slow-)?2g|3g/i.test(connection.effectiveType)) return false;
  if (typeof connection.downlink === 'number' && connection.downlink > 0 && connection.downlink < 1.5) return false;
  return true;
}

export function hasPrefetchedRouteChunk(key: string) {
  return prefetchedChunks.has(key);
}

export function markPrefetchedRouteChunk(key: string) {
  prefetchedChunks.add(key);
}

export function clearPrefetchedRouteChunk(key: string) {
  prefetchedChunks.delete(key);
}
