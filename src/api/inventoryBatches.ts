import { apiGet, apiPost } from './client';
import type { InventoryIssueBreakdown } from '../types/assets';

export type InventoryBatchKind = 'pc' | 'monitor';
export type InventoryBatchStatus = 'ACTIVE' | 'CLOSED';
export type InventoryBatchSnapshotStatus = 'queued' | 'running' | 'success' | 'failed' | 'canceled' | null;

export type InventoryBatchRow = {
  id: number;
  kind: InventoryBatchKind;
  name: string;
  status: InventoryBatchStatus;
  started_at: string;
  closed_at?: string | null;
  created_by?: string | null;
  closed_by?: string | null;
  summary_total?: number;
  summary_checked_ok?: number;
  summary_checked_issue?: number;
  summary_unchecked?: number;
  summary_issue_breakdown?: InventoryIssueBreakdown | null;
  snapshot_job_id?: number | null;
  snapshot_job_status?: InventoryBatchSnapshotStatus;
  snapshot_error_message?: string | null;
  snapshot_filename?: string | null;
  snapshot_object_key?: string | null;
  snapshot_file_size?: number | null;
  snapshot_exported_at?: string | null;
  updated_at?: string | null;
};

export type InventoryBatchPayload = {
  active: InventoryBatchRow | null;
  latest: InventoryBatchRow | null;
  recent: InventoryBatchRow[];
};


export function normalizeInventoryBatchPayload(payload?: Partial<InventoryBatchPayload> | null): InventoryBatchPayload {
  const latest = payload?.latest || null;
  const resolvedActive = payload?.active || (String(latest?.status || '').toUpperCase() === 'ACTIVE' ? latest : null);
  const resolvedLatest = resolvedActive || latest;
  const recent = (payload?.recent || []).filter((item): item is InventoryBatchRow => Boolean(item?.id) && (!resolvedActive || Number(item.id) !== Number(resolvedActive.id)));
  return {
    active: resolvedActive,
    latest: resolvedLatest,
    recent,
  };
}

const INVENTORY_BATCH_CLIENT_CACHE_TTL_MS = 5 * 60_000;
const inventoryBatchClientCache = new Map<InventoryBatchKind, { expiresAt: number; value: InventoryBatchPayload }>();
const inventoryBatchClientPending = new Map<InventoryBatchKind, Promise<InventoryBatchPayload>>();

function readInventoryBatchClientCache(kind: InventoryBatchKind) {
  const hit = inventoryBatchClientCache.get(kind);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    inventoryBatchClientCache.delete(kind);
    return null;
  }
  return hit.value;
}

function writeInventoryBatchClientCache(kind: InventoryBatchKind, value: InventoryBatchPayload) {
  inventoryBatchClientCache.set(kind, { expiresAt: Date.now() + INVENTORY_BATCH_CLIENT_CACHE_TTL_MS, value });
  return value;
}

export function invalidateInventoryBatchClientCache(kind?: InventoryBatchKind | null) {
  if (kind) {
    inventoryBatchClientCache.delete(kind);
    inventoryBatchClientPending.delete(kind);
    return;
  }
  inventoryBatchClientCache.clear();
  inventoryBatchClientPending.clear();
}

export async function fetchInventoryBatch(kind: InventoryBatchKind, options: { force?: boolean } = {}) {
  if (!options.force) {
    const cached = readInventoryBatchClientCache(kind);
    if (cached) return cached;
    const pending = inventoryBatchClientPending.get(kind);
    if (pending) return pending;
  }
  const task = apiGet(`/api/asset-inventory-batch?kind=${encodeURIComponent(kind)}`)
    .then((result: any) => writeInventoryBatchClientCache(kind, normalizeInventoryBatchPayload((result?.data || { active: null, latest: null, recent: [] }) as InventoryBatchPayload)))
    .finally(() => {
      if (inventoryBatchClientPending.get(kind) === task) inventoryBatchClientPending.delete(kind);
    });
  inventoryBatchClientPending.set(kind, task);
  return task;
}

export async function startInventoryBatch(kind: InventoryBatchKind, name: string, options: { clearPreviousLogs?: boolean } = {}) {
  const result: any = await apiPost('/api/asset-inventory-batch', {
    action: 'start',
    kind,
    name,
    clear_previous_logs: Boolean(options.clearPreviousLogs),
  });
  invalidateInventoryBatchClientCache(kind);
  return result;
}

export async function closeInventoryBatch(kind: InventoryBatchKind, id?: number | null) {
  const result: any = await apiPost('/api/asset-inventory-batch', {
    action: 'close',
    kind,
    id: id || undefined,
  });
  invalidateInventoryBatchClientCache(kind);
  return result;
}

export function getInventoryBatchSnapshotDownloadUrl(kind: InventoryBatchKind, id: number) {
  const q = new URLSearchParams();
  q.set('kind', kind);
  q.set('id', String(id));
  return `/api/asset-inventory-batch-snapshot-download?${q.toString()}`;
}

export function inventoryBatchSnapshotStatusText(status: InventoryBatchSnapshotStatus) {
  switch (String(status || '').toLowerCase()) {
    case 'queued':
      return '排队中';
    case 'running':
      return '生成中';
    case 'success':
      return '可下载';
    case 'failed':
      return '生成失败';
    case 'canceled':
      return '已取消';
    default:
      return '未生成';
  }
}
