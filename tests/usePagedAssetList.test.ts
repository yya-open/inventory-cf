import { describe, expect, it, vi } from 'vitest';
import { usePagedAssetList } from '../src/composables/usePagedAssetList';

describe('usePagedAssetList', () => {
  it('loads first page and fetches delayed total once', async () => {
    vi.useFakeTimers();
    const fetchPage = vi.fn(async ({ page }: { page: number }) => ({ rows: [{ id: page }] }));
    const fetchTotal = vi.fn(async () => 123);
    const list = usePagedAssetList({ createFilterKey: (f: { keyword: string }) => f.keyword, fetchPage, fetchTotal, totalDebounceMs: 10 });
    await list.load({ keyword: 'pc' });
    expect(list.rows.value).toEqual([{ id: 1 }]);
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchTotal).toHaveBeenCalledTimes(1);
    expect(list.total.value).toBe(123);
    await list.load({ keyword: 'pc' });
    expect(fetchTotal).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('respects page change and page size change', async () => {
    const fetchPage = vi.fn(async ({ page, pageSize }: { page: number; pageSize: number }) => ({ rows: [{ page, pageSize }], total: 66 }));
    const list = usePagedAssetList({ createFilterKey: () => 'fixed', fetchPage });
    await list.load({});
    await list.onPageChange({}, 3);
    expect(list.page.value).toBe(3);
    expect(list.rows.value[0]).toMatchObject({ page: 3, pageSize: 50 });
    await list.onPageSizeChange({}, 20);
    expect(list.page.value).toBe(1);
    expect(list.rows.value[0]).toMatchObject({ page: 1, pageSize: 20 });
    expect(list.total.value).toBe(66);
  });

  it('ignores stale responses when a newer query finishes first', async () => {
    let resolveFirst: ((value: { rows: Array<{ id: string }>; total: number }) => void) | null = null;
    let resolveSecond: ((value: { rows: Array<{ id: string }>; total: number }) => void) | null = null;
    const fetchPage = vi.fn(({ filters }: { filters: { keyword: string } }) => {
      return new Promise<{ rows: Array<{ id: string }>; total: number }>((resolve) => {
        if (filters.keyword === 'old') resolveFirst = resolve;
        if (filters.keyword === 'new') resolveSecond = resolve;
      });
    });

    const list = usePagedAssetList({ createFilterKey: (f: { keyword: string }) => f.keyword, fetchPage });
    const oldLoad = list.load({ keyword: 'old' });
    const newLoad = list.load({ keyword: 'new' });

    resolveSecond?.({ rows: [{ id: 'new' }], total: 1 });
    await newLoad;
    expect(list.rows.value).toEqual([{ id: 'new' }]);

    resolveFirst?.({ rows: [{ id: 'old' }], total: 1 });
    await oldLoad;
    expect(list.rows.value).toEqual([{ id: 'new' }]);
    expect(list.loading.value).toBe(false);
  });
});
