import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchInventoryBatch = vi.fn();
const normalizeInventoryBatchPayload = vi.fn((input) => input ?? { active: null, latest: null, recent: [] });

vi.mock('../src/api/inventoryBatches', () => ({
  fetchInventoryBatch,
  normalizeInventoryBatchPayload,
}));

describe('inventory batch store', async () => {
  const { useInventoryBatchStore } = await import('../src/domain/inventory/store');

  beforeEach(() => {
    fetchInventoryBatch.mockReset();
    normalizeInventoryBatchPayload.mockClear();
    useInventoryBatchStore('pc').reset();
  });

  it('loads and caches payload', async () => {
    fetchInventoryBatch.mockResolvedValueOnce({ active: { id: 1 }, latest: null, recent: [] });
    const store = useInventoryBatchStore('pc');
    await store.refresh({ force: true });
    expect(store.status.value).toBe('ready');
    expect(store.payload.value.active).toEqual({ id: 1 });
    expect(fetchInventoryBatch).toHaveBeenCalledTimes(1);

    await store.refresh({ force: false, ttlMs: 60_000 });
    expect(fetchInventoryBatch).toHaveBeenCalledTimes(1);
  });

  it('enters error state when fetch fails', async () => {
    const error = new Error('load failed');
    fetchInventoryBatch.mockRejectedValueOnce(error);
    const store = useInventoryBatchStore('pc');
    await expect(store.refresh({ force: true })).rejects.toThrow('load failed');
    expect(store.status.value).toBe('error');
    expect(store.error.value).toBe(error);
  });

  it('does not let an older refresh overwrite a newer applied payload', async () => {
    let resolveFetch: (value: any) => void = () => {};
    fetchInventoryBatch.mockReturnValueOnce(new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    const store = useInventoryBatchStore('pc');
    const pendingRefresh = store.refresh({ force: true });
    store.applyPayload({ active: { id: 2 }, latest: { id: 2 }, recent: [] });

    resolveFetch({ active: null, latest: null, recent: [] });
    await pendingRefresh;

    expect(store.status.value).toBe('ready');
    expect(store.payload.value.active).toEqual({ id: 2 });
    expect(store.payload.value.latest).toEqual({ id: 2 });
  });

  it('keeps reset state when an older refresh resolves afterward', async () => {
    let resolveFetch: (value: any) => void = () => {};
    fetchInventoryBatch.mockReturnValueOnce(new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    const store = useInventoryBatchStore('pc');
    const pendingRefresh = store.refresh({ force: true });
    store.reset();

    resolveFetch({ active: { id: 3 }, latest: { id: 3 }, recent: [] });
    await pendingRefresh;

    expect(store.status.value).toBe('idle');
    expect(store.payload.value).toEqual({ active: null, latest: null, recent: [] });
  });
});
