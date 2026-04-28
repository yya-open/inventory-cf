import { computed, onBeforeUnmount, ref } from 'vue';

type LoaderOptions<T> = {
  ttlMs?: number;
  backgroundRefreshMs?: number;
  initialData: () => T;
  load: (ctx: { force: boolean; signal?: AbortSignal }) => Promise<T>;
};

type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  pending?: Promise<T>;
};

const cacheMap = new Map<string, CacheEntry<any>>();

export function useSystemPageLoader<T>(cacheKey: string, options: LoaderOptions<T>) {
  const ttlMs = Math.max(1_000, Number(options.ttlMs || 60_000));
  const backgroundRefreshMs = Math.max(0, Number(options.backgroundRefreshMs || 0));
  const loading = ref(false);
  const loaded = ref(false);
  const error = ref('');
  const data = ref<T>(options.initialData());
  let requestSeq = 0;
  let controller: AbortController | null = null;
  let timer: number | null = null;

  function stopBackgroundRefresh() {
    if (timer != null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleBackgroundRefresh() {
    stopBackgroundRefresh();
    if (!backgroundRefreshMs) return;
    timer = window.setTimeout(() => {
      void load({ force: false, silent: true });
    }, backgroundRefreshMs);
  }

  async function load(args: { force?: boolean; silent?: boolean } = {}) {
    const force = !!args.force;
    const silent = !!args.silent;
    const seq = ++requestSeq;
    if (controller) {
      try { controller.abort(); } catch {}
    }
    controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (!silent) loading.value = true;
    error.value = '';

    try {
      const now = Date.now();
      const hit = cacheMap.get(cacheKey) as CacheEntry<T> | undefined;
      if (!force && hit?.value !== undefined && hit.expiresAt > now) {
        data.value = hit.value;
        loaded.value = true;
        scheduleBackgroundRefresh();
        return hit.value;
      }
      if (!force && hit?.pending) {
        const pendingValue = await hit.pending;
        if (seq === requestSeq) {
          data.value = pendingValue;
          loaded.value = true;
          scheduleBackgroundRefresh();
        }
        return pendingValue;
      }

      const pending = options.load({ force, signal: controller?.signal });
      cacheMap.set(cacheKey, { expiresAt: hit?.expiresAt || 0, value: hit?.value, pending });
      const value = await pending;
      cacheMap.set(cacheKey, { value, expiresAt: Date.now() + ttlMs });
      if (seq === requestSeq) {
        data.value = value;
        loaded.value = true;
        scheduleBackgroundRefresh();
      }
      return value;
    } catch (e: any) {
      if (controller?.signal?.aborted || String(e?.name || '') === 'AbortError') return data.value;
      if (seq === requestSeq) {
        error.value = e?.message || '加载失败';
      }
      throw e;
    } finally {
      const entry = cacheMap.get(cacheKey);
      if (entry?.pending) entry.pending = undefined;
      if (seq === requestSeq && !silent) loading.value = false;
    }
  }

  function invalidate() {
    cacheMap.delete(cacheKey);
  }

  onBeforeUnmount(() => {
    stopBackgroundRefresh();
    if (controller) {
      try { controller.abort(); } catch {}
      controller = null;
    }
  });

  return {
    data,
    loading,
    loaded,
    error,
    load,
    invalidate,
    hasError: computed(() => !!error.value),
  };
}
