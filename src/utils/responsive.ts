export const APP_MOBILE_BREAKPOINT = 1200;
export const LEDGER_MOBILE_BREAKPOINT = APP_MOBILE_BREAKPOINT;

function viewportWidth() {
  if (typeof window === 'undefined') return 0;
  const inner = window.innerWidth || 0;
  const client = document.documentElement?.clientWidth || inner;
  const visual = window.visualViewport?.width || 0;
  const candidates = [inner, client, visual].filter((value) => Number(value) > 0);
  if (!candidates.length) return 0;
  return Math.min(...candidates);
}

function matchMediaMobile(breakpoint: number) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
}

export function isAppMobileViewport() {
  const matched = matchMediaMobile(APP_MOBILE_BREAKPOINT);
  if (matched !== null) return matched;
  return viewportWidth() <= APP_MOBILE_BREAKPOINT;
}

export function isLedgerMobileViewport() {
  const matched = matchMediaMobile(LEDGER_MOBILE_BREAKPOINT);
  if (matched !== null) return matched;
  return viewportWidth() <= LEDGER_MOBILE_BREAKPOINT;
}
