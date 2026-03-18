export type PublicAssetTarget = { id?: string; key?: string; token?: string; href?: string };

const RECENT_KEY_PREFIX = 'inventory:public-recent:';
const MAX_RECENT = 8;

export function parsePublicTargetInput(input: string): PublicAssetTarget | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://local.test';
  try {
    const url = new URL(raw, origin);
    const id = (url.searchParams.get('id') || '').trim();
    const key = (url.searchParams.get('key') || '').trim();
    const token = (url.searchParams.get('token') || '').trim();
    if (token) return { token, href: url.pathname + url.search };
    if (id && key) return { id, key, href: url.pathname + url.search };
  } catch {}
  const match = raw.match(/(?:^|[?&])id=([^&]+).*?(?:^|[?&])key=([^&]+)/i);
  if (match) return { id: decodeURIComponent(match[1]), key: decodeURIComponent(match[2]) };
  const tokenMatch = raw.match(/(?:^|[?&])token=([^&]+)/i);
  if (tokenMatch) return { token: decodeURIComponent(tokenMatch[1]) };
  if (/^[A-Za-z0-9\-_]{20,}$/.test(raw)) return { token: raw };
  return null;
}

export function buildPublicQuery(target: PublicAssetTarget) {
  const qs = new URLSearchParams();
  if (target.token) qs.set('token', target.token);
  if (target.id && target.key) {
    qs.set('id', target.id);
    qs.set('key', target.key);
  }
  return qs.toString();
}

export function saveRecentPublicTarget(kind: 'pc' | 'monitor', target: PublicAssetTarget) {
  const qs = buildPublicQuery(target);
  if (!qs) return;
  const key = `${RECENT_KEY_PREFIX}${kind}`;
  let current: string[] = [];
  try { current = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  const next = [qs, ...current.filter((item) => item !== qs)].slice(0, MAX_RECENT);
  localStorage.setItem(key, JSON.stringify(next));
}

export function loadRecentPublicTargets(kind: 'pc' | 'monitor') {
  const key = `${RECENT_KEY_PREFIX}${kind}`;
  try {
    return (JSON.parse(localStorage.getItem(key) || '[]') || []) as string[];
  } catch {
    return [];
  }
}

export function getWeakNetworkText() {
  const nav: any = navigator;
  if (nav && nav.onLine === false) return '当前设备离线，请检查网络后重试。';
  const type = nav?.connection?.effectiveType || nav?.mozConnection?.effectiveType || nav?.webkitConnection?.effectiveType;
  if (type === 'slow-2g' || type === '2g') return '当前网络较弱，提交失败时可直接点击重试。';
  return '';
}

export function isNetworkError(error: any) {
  const message = String(error?.message || '').toLowerCase();
  return !error?.status && (message.includes('fetch') || message.includes('network') || message.includes('offline') || message.includes('failed'));
}

export function triggerSuccessVibration(enabled: boolean) {
  if (!enabled) return;
  const nav: any = navigator;
  if (typeof nav?.vibrate === 'function') {
    nav.vibrate([40, 30, 60]);
  }
}
