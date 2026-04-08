import { closeInventoryBatch, invalidateInventoryBatchClientCache, startInventoryBatch, type InventoryBatchKind, type InventoryBatchPayload } from '../../api/inventoryBatches';
import { invalidateAssetInventorySummaryCache } from '../../api/assetLedgers';
import type { AssetInventorySummary } from '../../types/assets';
import { buildSuggestedInventoryBatchName } from '../../utils/inventoryBatchNaming';

export type InventoryBatchStartPreview = {
  assetTotal: number;
  checkedOk: number;
  checkedIssue: number;
  unchecked: number;
  logTotal: number;
  activeName: string;
};

export function createInventoryBatchStartPreview(assetTotal: number, logTotal: number, summary: AssetInventorySummary, activeName?: string | null): InventoryBatchStartPreview {
  return {
    assetTotal: Number(assetTotal || 0),
    checkedOk: Number(summary?.checked_ok || 0),
    checkedIssue: Number(summary?.checked_issue || 0),
    unchecked: Number(summary?.unchecked || 0),
    logTotal: Number(logTotal || 0),
    activeName: activeName || '',
  };
}

export function suggestInventoryBatchName(kind: InventoryBatchKind, inventoryBatch: InventoryBatchPayload) {
  return buildSuggestedInventoryBatchName(kind, [inventoryBatch.active?.name, inventoryBatch.latest?.name, ...(inventoryBatch.recent || []).map((item) => item?.name)]);
}

export function invalidateInventoryBatchDomainCaches(kind: InventoryBatchKind) {
  invalidateInventoryBatchClientCache(kind);
  invalidateAssetInventorySummaryCache(kind);
}

export async function executeInventoryBatchStart(kind: InventoryBatchKind, name: string, options: { clearPreviousLogs?: boolean } = {}) {
  invalidateInventoryBatchDomainCaches(kind);
  try {
    return await startInventoryBatch(kind, name, options);
  } finally {
    invalidateInventoryBatchDomainCaches(kind);
  }
}

export async function executeInventoryBatchClose(kind: InventoryBatchKind, id: number) {
  invalidateInventoryBatchDomainCaches(kind);
  try {
    return await closeInventoryBatch(kind, id);
  } finally {
    invalidateInventoryBatchDomainCaches(kind);
  }
}
