const DISABLE_BROWSER_PERF = true;

export async function flushBrowserPerfQueue() {
  return;
}

export function trackRoutePerf(_path: string, _durationMs: number, _fullPath?: string) {
  if (DISABLE_BROWSER_PERF) return;
}

export function trackUiEvent(
  _eventName: string,
  _options?: { path?: string; fullPath?: string; metadata?: Record<string, unknown>; urgent?: boolean },
) {
  if (DISABLE_BROWSER_PERF) return;
}
