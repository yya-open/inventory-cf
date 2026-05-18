import { onScopeDispose } from 'vue';

type DebouncedFn<T extends (...args: any[]) => any> = ((...args: Parameters<T>) => void) & {
  flush: (...args: Parameters<T>) => void;
  cancel: () => void;
};

export function useDebouncedFn<T extends (...args: any[]) => any>(fn: T, delay = 250): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  const debounced = ((...args: Parameters<T>) => {
    clear();
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  }) as DebouncedFn<T>;

  debounced.flush = (...args: Parameters<T>) => {
    clear();
    fn(...args);
  };
  debounced.cancel = clear;

  onScopeDispose(clear);
  return debounced;
}
