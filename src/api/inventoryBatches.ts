import { apiGet, apiPost } from './client';

export type InventoryBatchKind = 'pc' | 'monitor';
export type InventoryBatchStatus = 'ACTIVE' | 'CLOSED';

export type InventoryBatchRow = {
  id: number;
  kind: InventoryBatchKind;
  name: string;
  status: InventoryBatchStatus;
  started_at: string;
  closed_at?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
};

export type InventoryBatchPayload = {
  active: InventoryBatchRow | null;
  latest: InventoryBatchRow | null;
  recent: InventoryBatchRow[];
};

export async function fetchInventoryBatch(kind: InventoryBatchKind) {
  const result: any = await apiGet(`/api/asset-inventory-batch?kind=${encodeURIComponent(kind)}`);
  return (result?.data || { active: null, latest: null, recent: [] }) as InventoryBatchPayload;
}

export async function startInventoryBatch(kind: InventoryBatchKind, name: string) {
  const result: any = await apiPost('/api/asset-inventory-batch', { action: 'start', kind, name });
  return result;
}

export async function closeInventoryBatch(kind: InventoryBatchKind, id?: number | null) {
  const result: any = await apiPost('/api/asset-inventory-batch', { action: 'close', kind, id: id || undefined });
  return result;
}
