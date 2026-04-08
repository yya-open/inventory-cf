import { apiGetData } from './client';
import { asObject } from './schema';
import type { AssetInventorySummary, InventoryIssueBreakdown } from '../types/assets';
import type { InventoryBatchPayload } from './inventoryBatches';
import { inventoryBatchPayloadSchema } from '../domain/inventory/schemas';
import { emptyInventoryIssueBreakdown } from '../types/assets';

export type InventoryOverviewPayload = {
  batch: InventoryBatchPayload;
  summary: AssetInventorySummary;
  issue_breakdown: InventoryIssueBreakdown;
};

function summarySchema(input: unknown): AssetInventorySummary {
  const row = asObject(input || {}, '盘点汇总');
  return {
    total: Number(row.total || 0),
    checked_ok: Number(row.checked_ok || 0),
    checked_issue: Number(row.checked_issue || 0),
    unchecked: Number(row.unchecked || 0),
  };
}

function issueBreakdownSchema(input: unknown): InventoryIssueBreakdown {
  const row = asObject(input || {}, '异常分布');
  const base = emptyInventoryIssueBreakdown();
  for (const key of Object.keys(base) as Array<keyof InventoryIssueBreakdown>) base[key] = Number((row as any)?.[key] || 0);
  return base;
}

function overviewSchema(input: unknown): InventoryOverviewPayload {
  const row = asObject(input, '盘点概览');
  return {
    batch: inventoryBatchPayloadSchema(row.batch || {}),
    summary: summarySchema(row.summary || {}),
    issue_breakdown: row.issue_breakdown ? issueBreakdownSchema(row.issue_breakdown) : emptyInventoryIssueBreakdown(),
  };
}

export async function getPcInventoryOverview(signal?: AbortSignal) {
  return apiGetData('/api/pc-inventory-overview', overviewSchema, { signal });
}

export async function getMonitorInventoryOverview(signal?: AbortSignal) {
  return apiGetData('/api/monitor-inventory-overview', overviewSchema, { signal });
}
