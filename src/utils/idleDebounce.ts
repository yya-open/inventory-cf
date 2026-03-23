type IdleDebouncedFn = (() => void) & {
  flush: () => void;
  cancel: () => void;
};

type RequestIdleHandle = number;

type WindowWithIdle = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => RequestIdleHandle;
  cancelIdleCallback?: (handle: RequestIdleHandle) => void;
};

export function createIdleDebounced(fn: () => void, wait = 250): IdleDebouncedFn {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let idleHandle: RequestIdleHandle | null = null;

  function clearPending() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const win = typeof window !== 'undefined' ? (window as WindowWithIdle) : null;
    if (win && idleHandle != null && typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(idleHandle);
      idleHandle = null;
    }
  }

  function invoke() {
    idleHandle = null;
    fn();
  }

  const wrapped = (() => {
    clearPending();
    timer = setTimeout(() => {
      timer = null;
      const win = typeof window !== 'undefined' ? (window as WindowWithIdle) : null;
      if (win && typeof win.requestIdleCallback === 'function') {
        idleHandle = win.requestIdleCallback(() => invoke(), { timeout: wait });
        return;
      }
      invoke();
    }, wait);
  }) as IdleDebouncedFn;

  wrapped.flush = () => {
    clearPending();
    fn();
  };
  wrapped.cancel = () => {
    clearPending();
  };

  return wrapped;
}
