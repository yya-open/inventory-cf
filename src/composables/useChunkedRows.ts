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

  function cancelRaf() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function schedule(total: number) {
    cancelRaf();
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
        rafId = 0;
        return;
      }
      visibleCount.value = Math.min(total, visibleCount.value + chunkSize);
      isChunking.value = visibleCount.value < total;
      rafId = requestAnimationFrame(pump);
    };
    rafId = requestAnimationFrame(pump);
  }

  watch(
    () => toValue(rowsSource),
    (rows) => schedule(Array.isArray(rows) ? rows.length : 0),
    { immediate: true, deep: false },
  );

  onBeforeUnmount(cancelRaf);

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
