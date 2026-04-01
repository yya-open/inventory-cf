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

  async function load(filters: TFilters, opts: { keepPage?: boolean; silent?: boolean; forceRefresh?: boolean } = {}) {
    const currentSeq = ++requestSeq;
    const nextPage = opts.keepPage ? page.value : 1;
    const filterKey = options.createFilterKey(filters);
    const cachePrefix = getFilterPrefix(options, filterKey);
    const effectivePageSize = clampPageSize(pageSize.value);
    if (effectivePageSize !== pageSize.value) pageSize.value = effectivePageSize;
    const pageKey = getPageCacheKey(options, filterKey, nextPage, effectivePageSize);
    const ttlMs = Number(options.cacheTtlMs ?? 30_000);
    const shouldShowLoading = !opts.silent || !rows.value.length;
    const cached = pageCache.get(pageKey);

    if (cached && !opts.forceRefresh && Date.now() - cached.timestamp < ttlMs) {
      rows.value = [...(cached.rows || [])] as TItem[];
      total.value = Number(cached.total || 0);
      if (!opts.keepPage) page.value = 1;
      if (!opts.silent) loading.value = false;
      return;
    }

    if (activePageRequestKey && activePageRequestKey !== pageKey) {
      pageController?.abort();
    }

    if (shouldShowLoading) loading.value = true;
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
        const request = options.fetchPage({ filters, page: nextPage, pageSize: effectivePageSize, fast: Boolean(options.fetchTotal), signal: controller.signal })
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
      if (!opts.keepPage) page.value = 1;

      pageCache.set(pageKey, {
        rows: [...(result.rows || [])],
        total: typeof result.total === 'number' ? Number(result.total || 0) : Number(total.value || 0),
        timestamp: Date.now(),
      });

      if (typeof result.total === 'number') {
        total.value = Number(result.total || 0);
        totalCache.set(filterKey, total.value);
        patchPageCacheTotal(cachePrefix, total.value);
        return;
      }
      if (!options.fetchTotal) {
        total.value = 0;
        patchPageCacheTotal(cachePrefix, 0);
        return;
      }
      if (totalCache.has(filterKey)) {
        total.value = Number(totalCache.get(filterKey) || 0);
        patchPageCacheTotal(cachePrefix, total.value);
        return;
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
        } catch (error) {
          if (!isAbortError(error)) {
            // noop
          }
        }
      }, options.totalDebounceMs ?? 250);
    } finally {
      if (currentSeq === requestSeq) loading.value = false;
    }
  }

  const reload = (filters: TFilters, opts: { silent?: boolean; forceRefresh?: boolean } = {}) => load(filters, { keepPage: false, ...opts });
  const invalidateTotal = (filters?: TFilters | string) => {
    if (typeof filters === 'undefined') {
      totalCache.clear();
      return;
    }
    const key = typeof filters === 'string' ? filters : options.createFilterKey(filters);
    totalCache.delete(key);
  };
  const invalidateCache = (filters?: TFilters | string) => {
    if (typeof filters === 'undefined') {
      clearPageCacheByPrefix(`${getNamespace(options)}::`);
      totalCache.clear();
      return;
    }
    const key = typeof filters === 'string' ? filters : options.createFilterKey(filters);
    clearPageCacheByPrefix(`${getFilterPrefix(options, key)}::`);
    totalCache.delete(key);
  };
  const clearTotalCache = () => totalCache.clear();
  const onPageChange = (filters: TFilters, nextPage: number) => {
    page.value = nextPage;
    return load(filters, { keepPage: true });
  };
  const onPageSizeChange = (filters: TFilters, nextPageSize: number) => {
    pageSize.value = clampPageSize(nextPageSize);
    page.value = 1;
    return load(filters, { keepPage: true });
  };

  return { rows, loading, page, pageSize, total, load, reload, onPageChange, onPageSizeChange, clearTotalTimer, abortOngoing, invalidateTotal, invalidateCache, clearTotalCache };
}
