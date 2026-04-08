import { errorResponse } from '../_auth';
import { ensurePcSchemaIfAllowed } from './_pc';
import { ensureMonitorSchemaIfAllowed } from './_monitor';
import { buildPcAssetQuery, buildMonitorAssetQuery } from './services/asset-ledger';
import { queryInventorySummaryByWhere } from './services/asset-inventory-state';
import { getInventoryBatchDomainSnapshot, type AssetInventoryKind } from './services/asset-inventory-domain';
import { getInventoryBatchSummaryForAssets } from './services/asset-inventory-batches';
import { requireAuthWithDataScope } from './services/data-scope';

type IssueBreakdown = {
  NOT_FOUND: number;
  WRONG_LOCATION: number;
  WRONG_QR: number;
  WRONG_STATUS: number;
  MISSING: number;
  OTHER: number;
};

function emptyIssueBreakdown(): IssueBreakdown {
  return {
    NOT_FOUND: 0,
    WRONG_LOCATION: 0,
    WRONG_QR: 0,
    WRONG_STATUS: 0,
    MISSING: 0,
    OTHER: 0,
  };
}

async function queryIssueBreakdown(db: D1Database, kind: AssetInventoryKind, batchId?: number | null) {
  const cfg = kind === 'pc'
    ? {
        logTable: 'pc_inventory_log',
        assetTable: 'pc_assets',
        joins: `
          JOIN pc_assets a ON a.id = l.asset_id
          LEFT JOIN (
            SELECT asset_id, MAX(id) AS max_id
            FROM pc_out
            GROUP BY asset_id
          ) lo ON lo.asset_id = l.asset_id
          LEFT JOIN pc_out o ON o.id = lo.max_id
        `,
      }
    : {
        logTable: 'monitor_inventory_log',
        assetTable: 'monitor_assets',
        joins: `
          JOIN monitor_assets a ON a.id = l.asset_id
          LEFT JOIN pc_locations loc ON loc.id = a.location_id
        `,
      };

  const wh = ['l.action=?'];
  const binds: any[] = ['ISSUE'];
  if (batchId && batchId > 0) {
    wh.push('l.batch_id=?');
    binds.push(batchId);
  }
  const sql = `
    SELECT COALESCE(NULLIF(TRIM(l.issue_type), ''), 'OTHER') AS issue_type, COUNT(*) AS c
    FROM ${cfg.logTable} l
    ${cfg.joins}
    WHERE ${wh.join(' AND ')}
    GROUP BY COALESCE(NULLIF(TRIM(l.issue_type), ''), 'OTHER')
  `;
  const rows = await db.prepare(sql).bind(...binds).all<any>();
  const breakdown = emptyIssueBreakdown();
  for (const row of Array.isArray(rows?.results) ? rows.results : []) {
    const key = String((row as any)?.issue_type || 'OTHER').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(breakdown, key)) {
      breakdown[key as keyof IssueBreakdown] = Number((row as any)?.c || 0);
    } else {
      breakdown.OTHER += Number((row as any)?.c || 0);
    }
  }
  return breakdown;
}

export const onRequestGet: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const user = await requireAuthWithDataScope(env, request, 'viewer');
    if (!env.DB) return Response.json({ ok: false, message: '未绑定 D1 数据库(DB)' }, { status: 500 });

    const url = new URL(request.url);
    const kind = String(url.searchParams.get('kind') || '').trim().toLowerCase() === 'monitor' ? 'monitor' : 'pc';
    if (kind === 'pc') await ensurePcSchemaIfAllowed(env.DB, env, url);
    else await ensureMonitorSchemaIfAllowed(env.DB, env, url);

    const batchPayload = await getInventoryBatchDomainSnapshot(env.DB, kind);
    const activeBatchId = Number(batchPayload.active?.id || 0) || 0;

    const summary = activeBatchId > 0
      ? await getInventoryBatchSummaryForAssets(env.DB, kind, activeBatchId)
      : await queryInventorySummaryByWhere(
          env.DB,
          kind === 'pc' ? 'pc_assets a' : 'monitor_assets a',
          kind === 'pc' ? buildPcAssetQuery(new URL(request.url), user) : buildMonitorAssetQuery(new URL(request.url), user),
        );
    const issue_breakdown = await queryIssueBreakdown(env.DB, kind, activeBatchId || null);

    return Response.json({
      ok: true,
      data: {
        kind,
        batch: batchPayload,
        summary,
        issue_breakdown,
      },
    });
  } catch (error: any) {
    return errorResponse(error);
  }
};
