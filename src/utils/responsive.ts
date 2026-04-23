export const APP_MOBILE_BREAKPOINT = 860;
export const LEDGER_MOBILE_BREAKPOINT = APP_MOBILE_BREAKPOINT;

function viewportWidth() {
  if (typeof window === 'undefined') return 0;
  return Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
}

export function isAppMobileViewport() {
  return viewportWidth() < APP_MOBILE_BREAKPOINT;
}

export function isLedgerMobileViewport() {
  return viewportWidth() < LEDGER_MOBILE_BREAKPOINT;
}
