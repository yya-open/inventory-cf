export const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev";
const CHECK_KEY = "inventory:app-build-check";
const RELOAD_KEY = "inventory:app-build-reload";

async function fetchRemoteBuildId() {
  const r = await fetch(`/?__build_check=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
  const text = await r.text();
  const match = text.match(/<meta\s+name=["']inventory-build-id["']\s+content=["']([^"']+)["']/i);
  return match?.[1] || null;
}

export function startBuildVersionWatcher() {
  if (typeof window === 'undefined') return;
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
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void run(); });
  window.addEventListener('focus', () => { void run(); });
  setTimeout(() => { void run(); }, 1500);
}
