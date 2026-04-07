export type PublicAssetTarget = { id?: string; key?: string; token?: string; href?: string };
export type PendingPublicSubmission = {
  id: string;
  kind: 'pc' | 'monitor';
  target: PublicAssetTarget;
  payload: { action: 'OK' | 'ISSUE'; issue_type?: string; remark?: string };
  createdAt: string;
  label: string;
};

const RECENT_KEY_PREFIX = 'inventory:public-recent:';
const PENDING_KEY_PREFIX = 'inventory:public-pending:';
const MAX_RECENT = 8;
const MAX_PENDING = 50;

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

export function saveRecentPublicTarget(kind: 'pc' | 'monitor', target: PublicAssetTarget, limit = MAX_RECENT) {
  const qs = buildPublicQuery(target);
  if (!qs) return;
  const key = `${RECENT_KEY_PREFIX}${kind}`;
  let current: string[] = [];
  try { current = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  const next = [qs, ...current.filter((item) => item !== qs)].slice(0, Math.max(1, limit || MAX_RECENT));
  localStorage.setItem(key, JSON.stringify(next));
}

export function loadRecentPublicTargets(kind: 'pc' | 'monitor', limit = MAX_RECENT) {
  const key = `${RECENT_KEY_PREFIX}${kind}`;
  try {
    return ((JSON.parse(localStorage.getItem(key) || '[]') || []) as string[]).slice(0, Math.max(1, limit || MAX_RECENT));
  } catch {
    return [];
  }
}

function getPendingStorageKey(kind: 'pc' | 'monitor') {
  return `${PENDING_KEY_PREFIX}${kind}`;
}

export function loadPendingPublicSubmissions(kind: 'pc' | 'monitor') {
  const key = getPendingStorageKey(kind);
  try {
    return (JSON.parse(localStorage.getItem(key) || '[]') || []) as PendingPublicSubmission[];
  } catch {
    return [];
  }
}

function savePendingPublicSubmissions(kind: 'pc' | 'monitor', items: PendingPublicSubmission[]) {
  localStorage.setItem(getPendingStorageKey(kind), JSON.stringify(items.slice(0, MAX_PENDING)));
}

export function enqueuePendingPublicSubmission(
  kind: 'pc' | 'monitor',
  target: PublicAssetTarget,
  payload: PendingPublicSubmission['payload'],
  label: string,
) {
  const pending = loadPendingPublicSubmissions(kind);
  const targetKey = buildPublicQuery(target);
  const payloadKey = JSON.stringify(payload || {});
  const deduped = pending.filter((item) => buildPublicQuery(item.target) !== targetKey || JSON.stringify(item.payload || {}) !== payloadKey);
  const entry: PendingPublicSubmission = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    target,
    payload,
    createdAt: new Date().toISOString(),
    label,
  };
  savePendingPublicSubmissions(kind, [entry, ...deduped]);
  return entry;
}

export function removePendingPublicSubmission(kind: 'pc' | 'monitor', entryId: string) {
  const pending = loadPendingPublicSubmissions(kind);
  savePendingPublicSubmissions(kind, pending.filter((item) => item.id !== entryId));
}

export async function flushPendingPublicSubmissions(
  kind: 'pc' | 'monitor',
  sender: (target: PublicAssetTarget, payload: PendingPublicSubmission['payload']) => Promise<void>,
) {
  const pending = loadPendingPublicSubmissions(kind);
  if (!pending.length) return { sent: 0, failed: 0 };
  const remain: PendingPublicSubmission[] = [];
  let sent = 0;
  for (const item of pending) {
    try {
      await sender(item.target, item.payload);
      sent += 1;
    } catch {
      remain.push(item);
    }
  }
  savePendingPublicSubmissions(kind, remain);
  return { sent, failed: remain.length };
}

export function getWeakNetworkText() {
  const nav: any = navigator;
  if (nav && nav.onLine === false) return '当前设备离线，提交会先进入待重试队列，网络恢复后可继续提交。';
  const type = nav?.connection?.effectiveType || nav?.mozConnection?.effectiveType || nav?.webkitConnection?.effectiveType;
  if (type === 'slow-2g' || type === '2g') return '当前网络较弱，提交失败时会提示重试，也可先进入待重试队列。';
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
