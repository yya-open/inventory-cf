import { ref } from "vue";

export type LoadResult<T> = { rows: T[]; total?: number | null };
export type LoadContext<TFilters> = { filters: TFilters; page: number; pageSize: number; fast: boolean; signal?: AbortSignal };
export type UsePagedAssetListOptions<TFilters, TItem> = {
  initialPageSize?: number;
  totalDebounceMs?: number;
  createFilterKey: (filters: TFilters) => string;
  fetchPage: (context: LoadContext<TFilters>) => Promise<LoadResult<TItem>>;
  fetchTotal?: (filters: TFilters, signal?: AbortSignal) => Promise<number>;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function usePagedAssetList<TFilters, TItem>(options: UsePagedAssetListOptions<TFilters, TItem>) {
  const rows = ref<TItem[]>([]);
  const loading = ref(false);
  const page = ref(1);
  const pageSize = ref(options.initialPageSize ?? 50);
  const total = ref(0);
  const totalCache = new Map<string, number>();
  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  let requestSeq = 0;
  let pageController: AbortController | null = null;
  let totalController: AbortController | null = null;

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

  async function load(filters: TFilters, opts: { keepPage?: boolean; silent?: boolean } = {}) {
    const currentSeq = ++requestSeq;
    abortOngoing();
    pageController = new AbortController();
    const shouldShowLoading = !opts.silent || !rows.value.length;
    if (shouldShowLoading) loading.value = true;
    try {
      const nextPage = opts.keepPage ? page.value : 1;
      let result: LoadResult<TItem>;
      try {
        result = await options.fetchPage({ filters, page: nextPage, pageSize: pageSize.value, fast: Boolean(options.fetchTotal), signal: pageController.signal });
      } catch (error) {
        if (currentSeq !== requestSeq || isAbortError(error)) return;
        throw error;
      }
      if (currentSeq !== requestSeq) return;

      rows.value = result.rows || [];
      if (!opts.keepPage) page.value = 1;

      const key = options.createFilterKey(filters);
      if (typeof result.total === 'number') {
        total.value = Number(result.total || 0);
        totalCache.set(key, total.value);
        return;
      }
      if (!options.fetchTotal) {
        total.value = 0;
        return;
      }
      if (totalCache.has(key)) {
        total.value = Number(totalCache.get(key) || 0);
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
          totalCache.set(key, value);
          total.value = value;
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

  const reload = (filters: TFilters) => load(filters, { keepPage: false });
  const invalidateTotal = (filters?: TFilters | string) => {
    if (typeof filters === 'undefined') {
      totalCache.clear();
      return;
    }
    const key = typeof filters === 'string' ? filters : options.createFilterKey(filters);
    totalCache.delete(key);
  };
  const clearTotalCache = () => totalCache.clear();
  const onPageChange = (filters: TFilters, nextPage: number) => {
    page.value = nextPage;
    return load(filters, { keepPage: true });
  };
  const onPageSizeChange = (filters: TFilters, nextPageSize: number) => {
    pageSize.value = nextPageSize;
    page.value = 1;
    return load(filters, { keepPage: true });
  };

  return { rows, loading, page, pageSize, total, load, reload, onPageChange, onPageSizeChange, clearTotalTimer, abortOngoing, invalidateTotal, clearTotalCache };
}
