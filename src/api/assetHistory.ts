import { apiGet } from "./client";
import { getCachedResource } from "../utils/resourceCache";

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

export async function getPcAssetHistory(id: number | string) {
  const assetId = Number(id || 0) || 0;
  if (!assetId) return {} as AssetHistorySummary;
  return getCachedResource(historyKey('pc', assetId), async () => {
    const res: any = await apiGet(`/api/pc-asset-history?id=${assetId}`);
    return (res?.data || {}) as AssetHistorySummary;
  }, { ttlMs: HISTORY_TTL_MS });
}

export async function getMonitorAssetHistory(id: number | string) {
  const assetId = Number(id || 0) || 0;
  if (!assetId) return {} as AssetHistorySummary;
  return getCachedResource(historyKey('monitor', assetId), async () => {
    const res: any = await apiGet(`/api/monitor-asset-history?id=${assetId}`);
    return (res?.data || {}) as AssetHistorySummary;
  }, { ttlMs: HISTORY_TTL_MS });
}
