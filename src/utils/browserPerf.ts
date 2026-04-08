const SAMPLE_RATE = 0.2;
const SLOW_ROUTE_MS = 1600;
const MAX_BUFFER = 20;
const AUTO_FLUSH_MIN_SIZE = 4;
const STORAGE_KEY = 'inventory:browser-perf-buffer';

type RoutePerfPayload = {
  kind: 'route';
  path: string;
  fullPath?: string;
  duration_ms: number;
  ts: number;
};

type UiEventPayload = {
  kind: 'event';
  path: string;
  fullPath?: string;
  event_name: string;
  metadata?: Record<string, unknown>;
  ts: number;
};

type PendingPerfPayload = RoutePerfPayload | UiEventPayload;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readBuffer(): PendingPerfPayload[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBuffer(items: PendingPerfPayload[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_BUFFER)));
  } catch {
    // ignore quota issues
  }
}

function shouldSend(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return false;
  if (durationMs >= SLOW_ROUTE_MS) return true;
  return Math.random() < SAMPLE_RATE;
}

function enqueue(payload: PendingPerfPayload) {
  const items = readBuffer();
  items.push(payload);
  writeBuffer(items);
}

async function flushPayloads(payloads: PendingPerfPayload[]) {
  if (!payloads.length) return true;
  const body = JSON.stringify({ samples: payloads });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon('/api/browser-performance', blob);
      if (ok) return true;
    }
  } catch {
    // ignore
  }
  try {
    const res = await fetch('/api/browser-performance', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(delayMs = 12_000) {
  if (typeof window === 'undefined') return;
  if (flushTimer) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushBrowserPerfQueue();
  }, Math.max(2_000, delayMs));
}

export async function flushBrowserPerfQueue() {
  if (flushing) return;
  const items = readBuffer();
  if (!items.length) return;
  flushing = true;
  try {
    const ok = await flushPayloads(items);
    if (ok) writeBuffer([]);
  } finally {
    flushing = false;
  }
}

export function trackRoutePerf(path: string, durationMs: number, fullPath?: string) {
  if (!shouldSend(durationMs)) return;
  enqueue({
    kind: 'route',
    path,
    fullPath,
    duration_ms: Math.round(durationMs),
    ts: Date.now(),
  });
  const size = readBuffer().length;
  if (durationMs >= SLOW_ROUTE_MS * 2 || size >= AUTO_FLUSH_MIN_SIZE) {
    void flushBrowserPerfQueue();
    return;
  }
  scheduleFlush();
}

export function trackUiEvent(eventName: string, options?: { path?: string; fullPath?: string; metadata?: Record<string, unknown>; urgent?: boolean }) {
  const name = String(eventName || '').trim();
  if (!name) return;
  const fallbackPath = typeof window !== 'undefined' ? window.location.pathname : '/';
  const fallbackFullPath = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : fallbackPath;
  enqueue({
    kind: 'event',
    event_name: name.slice(0, 80),
    path: String(options?.path || fallbackPath || '/').slice(0, 180),
    fullPath: String(options?.fullPath || fallbackFullPath || fallbackPath).slice(0, 500),
    metadata: options?.metadata && Object.keys(options.metadata).length ? options.metadata : undefined,
    ts: Date.now(),
  });
  const size = readBuffer().length;
  if (options?.urgent || size >= AUTO_FLUSH_MIN_SIZE) {
    void flushBrowserPerfQueue();
    return;
  }
  scheduleFlush(8_000);
}
