export const APP_MOBILE_BREAKPOINT = 900;
export const LEDGER_MOBILE_BREAKPOINT = APP_MOBILE_BREAKPOINT;

function viewportWidth() {
  if (typeof window === 'undefined') return 0;
  const inner = window.innerWidth || 0;
  const client = document.documentElement?.clientWidth || inner;
  return Math.min(inner || client, client || inner);
}

export function isAppMobileViewport() {
  return viewportWidth() < APP_MOBILE_BREAKPOINT;
}

export function isLedgerMobileViewport() {
  return viewportWidth() < LEDGER_MOBILE_BREAKPOINT;
}
