export function scheduleOnIdle(task: () => void, timeout = 800) {
  if (typeof window === "undefined") {
    task();
    return () => undefined;
  }
  const win = window as Window & { requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number; cancelIdleCallback?: (id: number) => void };
  if (typeof win.requestIdleCallback === 'function') {
    const id = win.requestIdleCallback(() => task(), { timeout });
    return () => win.cancelIdleCallback?.(id);
  }
  const timer = window.setTimeout(task, 32);
  return () => window.clearTimeout(timer);
}
