import { apiGet } from "./client";
import { getCachedResource, invalidateCachedResource } from "../utils/resourceCache";

export type AssetHistorySummary = {
  previous_employee_no?: string | null;
  previous_employee_name?: string | null;
  previous_department?: string | null;
  previous_assigned_at?: string | null;
};

const HISTORY_TTL_MS = 10 * 60_000;

function historyKey(kind: "pc" | "monitor", id: number | string) {
  return `asset-history::${kind}::${Number(id || 0) || 0}`;
}

function historyPath(path: string, assetId: number, force?: boolean) {
  const params = new URLSearchParams({ id: String(assetId) });
  if (force) params.set('no_cache', String(Date.now()));
  return `${path}?${params.toString()}`;
}

export function invalidateAssetHistoryCache(kind?: "pc" | "monitor", id?: number | string) {
  if (!kind) return invalidateCachedResource('asset-history');
  const assetId = Number(id || 0) || 0;
  return invalidateCachedResource(assetId ? historyKey(kind, assetId) : `asset-history::${kind}`);
}

export async function getPcAssetHistory(id: number | string, options?: { force?: boolean }) {
  const assetId = Number(id || 0) || 0;
  if (!assetId) return {} as AssetHistorySummary;
  return getCachedResource(historyKey('pc', assetId), async () => {
    const res: any = await apiGet(historyPath('/api/pc-asset-history', assetId, options?.force));
    return (res?.data || {}) as AssetHistorySummary;
  }, { ttlMs: HISTORY_TTL_MS, force: Boolean(options?.force) });
}

export async function getMonitorAssetHistory(id: number | string, options?: { force?: boolean }) {
  const assetId = Number(id || 0) || 0;
  if (!assetId) return {} as AssetHistorySummary;
  return getCachedResource(historyKey('monitor', assetId), async () => {
    const res: any = await apiGet(historyPath('/api/monitor-asset-history', assetId, options?.force));
    return (res?.data || {}) as AssetHistorySummary;
  }, { ttlMs: HISTORY_TTL_MS, force: Boolean(options?.force) });
}
