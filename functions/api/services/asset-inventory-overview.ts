import { ensureMonitorSchemaIfAllowed } from '../_monitor';
import { ensurePcSchemaIfAllowed } from '../_pc';
import { buildMonitorAssetQuery, buildPcAssetQuery } from './asset-ledger';
import { queryInventorySummaryByWhere } from './asset-inventory-state';
import { getInventoryBatchDomainSnapshot } from './asset-inventory-domain';
import { getInventoryIssueBreakdownForBatchLogs, type AssetInventoryKind } from './asset-inventory-batches';
import { isDefaultInventorySummaryRequest, readDefaultInventorySummaryCache } from './asset-inventory-summary-cache';
import { type ScopedUser } from './data-scope';

export async function getAssetInventoryOverview(
  db: D1Database,
  env: any,
  request: Request,
  kind: AssetInventoryKind,
  user: ScopedUser,
) {
  const url = new URL(request.url);
  if (kind === 'pc') await ensurePcSchemaIfAllowed(db, env, url);
  else await ensureMonitorSchemaIfAllowed(db, env, url);

  const batch = await getInventoryBatchDomainSnapshot(db, kind);

  let summary;
  if (isDefaultInventorySummaryRequest(url, kind)) {
    summary = await readDefaultInventorySummaryCache(db, kind, user);
  } else {
    const params = new URL(url);
    params.searchParams.delete('inventory_status');
    const query = kind === 'pc' ? buildPcAssetQuery(params, user) : buildMonitorAssetQuery(params, user);
    summary = await queryInventorySummaryByWhere(db, kind === 'pc' ? 'pc_assets a' : 'monitor_assets a', query);
  }

  let issueBreakdown = null;
  const activeBatchId = Number(batch?.active?.id || 0);
  if (activeBatchId > 0) {
    issueBreakdown = await getInventoryIssueBreakdownForBatchLogs(db, kind, activeBatchId);
  }

  return { batch, summary, issue_breakdown: issueBreakdown };
}
