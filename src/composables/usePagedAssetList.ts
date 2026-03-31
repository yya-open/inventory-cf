import { ref } from "vue";

export type LoadResult<T> = { rows: T[]; total?: number | null };
export type LoadContext<TFilters> = { filters: TFilters; page: number; pageSize: number; fast: boolean; signal?: AbortSignal };
export type UsePagedAssetListOptions<TFilters, TItem> = {
  initialPageSize?: number;
  totalDebounceMs?: number;
  cacheNamespace?: string;
  cacheTtlMs?: number;
  createFilterKey: (filters: TFilters) => string;
  fetchPage: (context: LoadContext<TFilters>) => Promise<LoadResult<TItem>>;
  fetchTotal?: (filters: TFilters, signal?: AbortSignal) => Promise<number>;
  maxPageSize?: number;
};

type PageCacheEntry = { rows: any[]; total: number; timestamp: number };
type InflightPageRequest = { controller: AbortController; promise: Promise<LoadResult<any>> };

type PersistentPageCacheEntry = PageCacheEntry;

type PersistentTotalEntry = { total: number; timestamp: number };

const pageCache = new Map<string, PageCacheEntry>();
const pageRequests = new Map<string, InflightPageRequest>();

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function getNamespace(options: UsePagedAssetListOptions<any, any>) {
  return String(options.cacheNamespace || 'paged-list');
}

function getFilterPrefix(options: UsePagedAssetListOptions<any, any>, filterKey: string) {
  return `${getNamespace(options)}::${filterKey}`;
}

function getPageCacheKey(options: UsePagedAssetListOptions<any, any>, filterKey: string, page: number, pageSize: number) {
  return `${getFilterPrefix(options, filterKey)}::page=${page}::size=${pageSize}`;
}

function getPersistentPageCacheKey(options: UsePagedAssetListOptions<any, any>, filterKey: string, page: number, pageSize: number) {
  return `inventory:paged-cache:${getPageCacheKey(options, filterKey, page, pageSize)}`;
}

function getPersistentFilterPrefix(options: UsePagedAssetListOptions<any, any>, filterKey: string) {
  return `inventory:paged-cache:${getFilterPrefix(options, filterKey)}`;
}

function getPersistentNamespacePrefix(options: UsePagedAssetListOptions<any, any>) {
  return `inventory:paged-cache:${getNamespace(options)}::`;
}

function getPersistentTotalKey(options: UsePagedAssetListOptions<any, any>, filterKey: string) {
  return `inventory:paged-total:${getNamespace(options)}::${filterKey}`;
}

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function readJsonFromSessionStorage<T>(key: string): T | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJsonToSessionStorage(key: string, value: unknown) {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota / security errors
  }
}

function removeSessionStorageByPrefix(prefix: string) {
  if (!canUseSessionStorage()) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // ignore
  }
}

function readPersistentPageCache(options: UsePagedAssetListOptions<any, any>, filterKey: string, page: number, pageSize: number, ttlMs: number) {
  const key = getPersistentPageCacheKey(options, filterKey, page, pageSize);
  const cached = readJsonFromSessionStorage<PersistentPageCacheEntry>(key);
  if (!cached) return null;
  if (!Array.isArray(cached.rows)) return null;
  if (Date.now() - Number(cached.timestamp || 0) > ttlMs) return null;
  return {
    rows: [...cached.rows],
    total: Number(cached.total || 0),
    timestamp: Number(cached.timestamp || 0),
  } satisfies PageCacheEntry;
}

function persistPageCache(options: UsePagedAssetListOptions<any, any>, filterKey: string, page: number, pageSize: number, entry: PageCacheEntry) {
  writeJsonToSessionStorage(getPersistentPageCacheKey(options, filterKey, page, pageSize), {
    rows: [...(entry.rows || [])],
    total: Number(entry.total || 0),
    timestamp: Number(entry.timestamp || Date.now()),
  } satisfies PersistentPageCacheEntry);
}

function readPersistentTotal(options: UsePagedAssetListOptions<any, any>, filterKey: string, ttlMs: number) {
  const payload = readJsonFromSessionStorage<PersistentTotalEntry>(getPersistentTotalKey(options, filterKey));
  if (!payload) return null;
  if (Date.now() - Number(payload.timestamp || 0) > ttlMs) return null;
  return Number(payload.total || 0);
}

function persistTotal(options: UsePagedAssetListOptions<any, any>, filterKey: string, value: number) {
  writeJsonToSessionStorage(getPersistentTotalKey(options, filterKey), {
    total: Number(value || 0),
    timestamp: Date.now(),
  } satisfies PersistentTotalEntry);
}

function clearPageCacheByPrefix(prefix: string) {
  for (const key of [...pageCache.keys()]) {
    if (key.startsWith(prefix)) pageCache.delete(key);
  }
}

function patchPageCacheTotal(prefix: string, total: number) {
  for (const [key, entry] of pageCache.entries()) {
    if (!key.startsWith(prefix)) continue;
    pageCache.set(key, { ...entry, total });
  }
}

export function usePagedAssetList<TFilters, TItem>(options: UsePagedAssetListOptions<TFilters, TItem>) {
  const rows = ref<TItem[]>([]);
  const loading = ref(false);
  const refreshing = ref(false);
  const initialized = ref(false);
  const page = ref(1);
  const maxPageSize = Math.max(20, Number(options.maxPageSize ?? 200) || 200);
  const clampPageSize = (value: number) => Math.min(maxPageSize, Math.max(20, Number(value || 50) || 50));
  const pageSize = ref(clampPageSize(options.initialPageSize ?? 50));
  const total = ref(0);
  const totalCache = new Map<string, number>();
  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  let requestSeq = 0;
  let pageController: AbortController | null = null;
  let totalController: AbortController | null = null;
  let activePageRequestKey = '';

  function clearTotalTimer() {
    if (totalTimer) {
      clearTimeout(totalTimer);
      totalTimer = null;
    }
  }

  function abortOngoing() {
    pageController?.abort();
    totalController?.abort();
  }

  function hydrateWarmCache(filterKey: string, nextPage: number, effectivePageSize: number, ttlMs: number) {
    const pageKey = getPageCacheKey(options, filterKey, nextPage, effectivePageSize);
    const memoryCached = pageCache.get(pageKey) || null;
    const persistentCached = readPersistentPageCache(options, filterKey, nextPage, effectivePageSize, ttlMs);
    const cached = memoryCached || persistentCached;
    if (!cached) return null;
    rows.value = [...(cached.rows || [])] as TItem[];
    if (Number.isFinite(cached.total)) {
      total.value = Number(cached.total || 0);
    }
    initialized.value = true;
    return cached;
  }

  function resolveKnownTotal(filterKey: string, fallback = 0) {
    if (totalCache.has(filterKey)) return Number(totalCache.get(filterKey) || 0);
    const persisted = readPersistentTotal(options, filterKey, Number(options.cacheTtlMs ?? 30_000) * 4);
    if (persisted !== null) {
      totalCache.set(filterKey, persisted);
      return persisted;
    }
    return Number(fallback || 0);
  }

  async function load(filters: TFilters, opts: { keepPage?: boolean; silent?: boolean; forceRefresh?: boolean } = {}) {
    const currentSeq = ++requestSeq;
    const nextPage = opts.keepPage ? page.value : 1;
    const filterKey = options.createFilterKey(filters);
    const cachePrefix = getFilterPrefix(options, filterKey);
    const effectivePageSize = clampPageSize(pageSize.value);
    if (effectivePageSize !== pageSize.value) pageSize.value = effectivePageSize;
    const pageKey = getPageCacheKey(options, filterKey, nextPage, effectivePageSize);
    const ttlMs = Number(options.cacheTtlMs ?? 30_000);
    const cached = hydrateWarmCache(filterKey, nextPage, effectivePageSize, ttlMs);

    if (cached && !opts.keepPage) page.value = 1;
    if (cached && !opts.forceRefresh && Date.now() - cached.timestamp < ttlMs) {
      const warmTotal = resolveKnownTotal(filterKey, cached.total);
      total.value = warmTotal;
      if (!opts.silent) {
        loading.value = false;
        refreshing.value = false;
      }
      return;
    }

    const hasWarmRows = Boolean(rows.value.length);
    const shouldShowLoading = !opts.silent && !hasWarmRows;

    if (activePageRequestKey && activePageRequestKey !== pageKey) {
      pageController?.abort();
    }

    loading.value = shouldShowLoading;
    refreshing.value = !shouldShowLoading && !opts.silent;
    activePageRequestKey = pageKey;

    try {
      let result: LoadResult<TItem>;
      const existingRequest = !opts.forceRefresh ? pageRequests.get(pageKey) : null;
      if (existingRequest) {
        pageController = existingRequest.controller;
        try {
          result = await existingRequest.promise as LoadResult<TItem>;
        } catch (error) {
          if (currentSeq !== requestSeq || isAbortError(error)) return;
          throw error;
        }
      } else {
        const controller = new AbortController();
        pageController = controller;
        const request = options.fetchPage({ filters, page: nextPage, pageSize: effectivePageSize, fast: true, signal: controller.signal })
          .finally(() => {
            const active = pageRequests.get(pageKey);
            if (active?.promise === request) pageRequests.delete(pageKey);
          });
        pageRequests.set(pageKey, { controller, promise: request as Promise<LoadResult<any>> });
        try {
          result = await request;
        } catch (error) {
          if (currentSeq !== requestSeq || isAbortError(error)) return;
          throw error;
        }
      }
      if (currentSeq !== requestSeq) return;

      rows.value = result.rows || [];
      initialized.value = true;
      if (!opts.keepPage) page.value = 1;

      const knownTotal = typeof result.total === 'number'
        ? Number(result.total || 0)
        : resolveKnownTotal(filterKey, total.value);

      const entry = {
        rows: [...(result.rows || [])],
        total: knownTotal,
        timestamp: Date.now(),
      } satisfies PageCacheEntry;
      pageCache.set(pageKey, entry);
      persistPageCache(options, filterKey, nextPage, effectivePageSize, entry);

      if (typeof result.total === 'number') {
        total.value = Number(result.total || 0);
        totalCache.set(filterKey, total.value);
        persistTotal(options, filterKey, total.value);
        patchPageCacheTotal(cachePrefix, total.value);
        return;
      }
      if (!options.fetchTotal) {
        total.value = 0;
        patchPageCacheTotal(cachePrefix, 0);
        persistTotal(options, filterKey, 0);
        return;
      }

      const cachedTotal = resolveKnownTotal(filterKey, knownTotal);
      if (cachedTotal > 0 || totalCache.has(filterKey)) {
        total.value = cachedTotal;
        patchPageCacheTotal(cachePrefix, cachedTotal);
      }

      clearTotalTimer();
      totalController?.abort();
      totalController = new AbortController();
      totalTimer = setTimeout(async () => {
        const totalSeq = requestSeq;
        try {
          const value = Number(await options.fetchTotal!(filters, totalController?.signal));
          if (totalSeq !== requestSeq) return;
          totalCache.set(filterKey, value);
          total.value = value;
          patchPageCacheTotal(cachePrefix, value);
          persistTotal(options, filterKey, value);
          const currentPageKey = getPageCacheKey(options, filterKey, page.value, pageSize.value);
          const currentEntry = pageCache.get(currentPageKey);
          if (currentEntry) {
            const patchedEntry = { ...currentEntry, total: value, timestamp: currentEntry.timestamp };
            pageCache.set(currentPageKey, patchedEntry);
            persistPageCache(options, filterKey, page.value, pageSize.value, patchedEntry);
          }
        } catch (error) {
          if (!isAbortError(error)) {
            // noop
          }
        }
      }, options.totalDebounceMs ?? 800);
    } finally {
      if (currentSeq === requestSeq) {
        loading.value = false;
        refreshing.value = false;
      }
    }
  }

  const reload = (filters: TFilters, opts: { silent?: boolean; forceRefresh?: boolean } = {}) => load(filters, { keepPage: false, ...opts });
  const invalidateTotal = (filters?: TFilters | string) => {
    if (typeof filters === 'undefined') {
      totalCache.clear();
      removeSessionStorageByPrefix(`inventory:paged-total:${getNamespace(options)}::`);
      return;
    }
    const key = typeof filters === 'string' ? filters : options.createFilterKey(filters);
    totalCache.delete(key);
    if (canUseSessionStorage()) window.sessionStorage.removeItem(getPersistentTotalKey(options, key));
  };
  const invalidateCache = (filters?: TFilters | string) => {
    if (typeof filters === 'undefined') {
      clearPageCacheByPrefix(`${getNamespace(options)}::`);
      totalCache.clear();
      removeSessionStorageByPrefix(getPersistentNamespacePrefix(options));
      removeSessionStorageByPrefix(`inventory:paged-total:${getNamespace(options)}::`);
      return;
    }
    const key = typeof filters === 'string' ? filters : options.createFilterKey(filters);
    clearPageCacheByPrefix(`${getFilterPrefix(options, key)}::`);
    totalCache.delete(key);
    removeSessionStorageByPrefix(getPersistentFilterPrefix(options, key));
    if (canUseSessionStorage()) window.sessionStorage.removeItem(getPersistentTotalKey(options, key));
  };
  const clearTotalCache = () => {
    totalCache.clear();
    removeSessionStorageByPrefix(`inventory:paged-total:${getNamespace(options)}::`);
  };
  const onPageChange = (filters: TFilters, nextPage: number) => {
    page.value = nextPage;
    return load(filters, { keepPage: true });
  };
  const onPageSizeChange = (filters: TFilters, nextPageSize: number) => {
    pageSize.value = clampPageSize(nextPageSize);
    page.value = 1;
    return load(filters, { keepPage: true });
  };

  return { rows, loading, refreshing, initialized, page, pageSize, total, load, reload, onPageChange, onPageSizeChange, clearTotalTimer, abortOngoing, invalidateTotal, invalidateCache, clearTotalCache };
}
