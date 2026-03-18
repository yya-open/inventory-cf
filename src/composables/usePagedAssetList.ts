import { ref } from "vue";

export type LoadResult<T> = { rows: T[]; total?: number | null };
export type LoadContext<TFilters> = { filters: TFilters; page: number; pageSize: number; fast: boolean };
export type UsePagedAssetListOptions<TFilters, TItem> = {
  initialPageSize?: number;
  totalDebounceMs?: number;
  createFilterKey: (filters: TFilters) => string;
  fetchPage: (context: LoadContext<TFilters>) => Promise<LoadResult<TItem>>;
  fetchTotal?: (filters: TFilters) => Promise<number>;
};

export function usePagedAssetList<TFilters, TItem>(options: UsePagedAssetListOptions<TFilters, TItem>) {
  const rows = ref<TItem[]>([]);
  const loading = ref(false);
  const page = ref(1);
  const pageSize = ref(options.initialPageSize ?? 50);
  const total = ref(0);
  const totalCache = new Map<string, number>();
  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  let requestSeq = 0;

  function clearTotalTimer() {
    if (totalTimer) {
      clearTimeout(totalTimer);
      totalTimer = null;
    }
  }

  async function load(filters: TFilters, opts: { keepPage?: boolean } = {}) {
    const currentSeq = ++requestSeq;
    loading.value = true;
    try {
      const nextPage = opts.keepPage ? page.value : 1;
      let result: LoadResult<TItem>;
      try {
        result = await options.fetchPage({ filters, page: nextPage, pageSize: pageSize.value, fast: Boolean(options.fetchTotal) });
      } catch (error) {
        if (currentSeq !== requestSeq) return;
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
      totalTimer = setTimeout(async () => {
        const totalSeq = requestSeq;
        try {
          const value = Number(await options.fetchTotal!(filters));
          if (totalSeq !== requestSeq) return;
          totalCache.set(key, value);
          total.value = value;
        } catch {
          // noop
        }
      }, options.totalDebounceMs ?? 250);
    } finally {
      if (currentSeq === requestSeq) loading.value = false;
    }
  }

  const reload = (filters: TFilters) => load(filters, { keepPage: false });
  const onPageChange = (filters: TFilters, nextPage: number) => {
    page.value = nextPage;
    return load(filters, { keepPage: true });
  };
  const onPageSizeChange = (filters: TFilters, nextPageSize: number) => {
    pageSize.value = nextPageSize;
    page.value = 1;
    return load(filters, { keepPage: true });
  };

  return { rows, loading, page, pageSize, total, load, reload, onPageChange, onPageSizeChange, clearTotalTimer };
}
