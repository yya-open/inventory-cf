import { closeInventoryBatch, startInventoryBatch, type InventoryBatchKind, type InventoryBatchPayload } from '../api/inventoryBatches';
import type { AssetInventorySummary } from '../types/assets';
import { exportInventoryLogsBeforeBatch } from './inventoryBatchExport';
import { buildSuggestedInventoryBatchName } from './inventoryBatchNaming';

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

export async function executeInventoryBatchStart(kind: InventoryBatchKind, name: string, options: { clearPreviousLogs?: boolean } = {}) {
  await exportInventoryLogsBeforeBatch(kind);
  return startInventoryBatch(kind, name, options);
}

export async function executeInventoryBatchClose(kind: InventoryBatchKind, id: number) {
  return closeInventoryBatch(kind, id);
}
