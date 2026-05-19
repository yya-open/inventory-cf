export const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev";
const CHECK_KEY = "inventory:app-build-check";
const RELOAD_KEY = "inventory:app-build-reload";
const WATCHER_FLAG = "__inventoryBuildVersionWatcherStarted";

async function fetchRemoteBuildId() {
  const r = await fetch(`/?__build_check=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
  const text = await r.text();
  const match = text.match(/<meta\s+name=["']inventory-build-id["']\s+content=["']([^"']+)["']/i);
  return match?.[1] || null;
}

function scheduleBuildVersionCheck(task: () => void, delayMs = 10_000) {
  if (typeof window === 'undefined') return;
  const runner = () => window.setTimeout(task, delayMs);
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => runner(), { timeout: delayMs + 2_000 });
    return;
  }
  window.setTimeout(task, delayMs);
}

export function startBuildVersionWatcher() {
  if (typeof window === 'undefined') return;
  const win = window as Window & { [WATCHER_FLAG]?: boolean };
  if (win[WATCHER_FLAG]) return;
  win[WATCHER_FLAG] = true;

  let running = false;
  let lastCheckAt = 0;
  const run = async () => {
    if (running) return;
    const now = Date.now();
    if (now - lastCheckAt < 15000) return;
    lastCheckAt = now;
    running = true;
    try {
      const remote = await fetchRemoteBuildId();
      if (!remote || remote === APP_BUILD_ID) return;
      const reloaded = sessionStorage.getItem(RELOAD_KEY);
      sessionStorage.setItem(CHECK_KEY, remote);
      if (reloaded === remote) return;
      sessionStorage.setItem(RELOAD_KEY, remote);
      window.location.reload();
    } catch {}
    finally { running = false; }
  };
  const runWhenVisible = () => { if (document.visibilityState === 'visible') void run(); };
  const runOnFocus = () => { void run(); };
  window.addEventListener('visibilitychange', runWhenVisible);
  window.addEventListener('focus', runOnFocus);
  scheduleBuildVersionCheck(() => { void run(); });
}
