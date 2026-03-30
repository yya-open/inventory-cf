import { computed, onBeforeUnmount, ref, watch, type MaybeRefOrGetter } from 'vue';
import { toValue } from 'vue';

type ChunkedRowsOptions = {
  threshold?: number;
  chunkSize?: number;
};

export function useChunkedRows<T>(rowsSource: MaybeRefOrGetter<T[]>, options: ChunkedRowsOptions = {}) {
  const threshold = Math.max(1, Number(options.threshold ?? 120) || 120);
  const chunkSize = Math.max(20, Number(options.chunkSize ?? 80) || 80);
  const visibleCount = ref(0);
  const isChunking = ref(false);
  let rafId = 0;
  let idleId = 0;

  function cancelScheduled() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (idleId && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      (window as any).cancelIdleCallback(idleId);
      idleId = 0;
    }
  }

  function scheduleNext(callback: () => void) {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(() => {
        idleId = 0;
        callback();
      }, { timeout: 80 });
      return;
    }
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      callback();
    });
  }

  function schedule(total: number) {
    cancelScheduled();
    if (total <= threshold) {
      visibleCount.value = total;
      isChunking.value = false;
      return;
    }
    visibleCount.value = Math.min(chunkSize, total);
    isChunking.value = visibleCount.value < total;
    const pump = () => {
      if (visibleCount.value >= total) {
        visibleCount.value = total;
        isChunking.value = false;
        return;
      }
      visibleCount.value = Math.min(total, visibleCount.value + chunkSize);
      isChunking.value = visibleCount.value < total;
      scheduleNext(pump);
    };
    scheduleNext(pump);
  }

  watch(
    () => toValue(rowsSource),
    (rows) => schedule(Array.isArray(rows) ? rows.length : 0),
    { immediate: true, deep: false },
  );

  onBeforeUnmount(cancelScheduled);

  const renderRows = computed(() => {
    const rows = toValue(rowsSource) || [];
    if (rows.length <= threshold) return rows;
    return rows.slice(0, visibleCount.value || 0);
  });

  const renderProgress = computed(() => {
    const rows = toValue(rowsSource) || [];
    return {
      visible: Number(renderRows.value.length || 0),
      total: Number(rows.length || 0),
    };
  });

  return {
    renderRows,
    renderProgress,
    isChunking,
  };
}
