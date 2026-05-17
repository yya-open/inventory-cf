import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePagedAssetList } from '../src/composables/usePagedAssetList';

describe('paged asset list loading safeguards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('releases the initial skeleton when a page request stalls past the timeout', async () => {
    const list = usePagedAssetList({
      requestTimeoutMs: 50,
      createFilterKey: () => 'default',
      fetchPage: () => new Promise(() => {}),
    });

    void list.load({}, { forceRefresh: true });
    expect(list.initialLoading.value).toBe(true);

    await vi.advanceTimersByTimeAsync(50);

    expect(list.initialLoading.value).toBe(false);
    expect(list.loading.value).toBe(false);
    expect(list.refreshing.value).toBe(false);
    expect(list.initialized.value).toBe(true);
  });
});
