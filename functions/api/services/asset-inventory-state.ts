import type { QueryParts } from './asset-ledger';
import { sqlNowStored } from '../_time';

export type AssetInventoryKind = 'pc' | 'monitor';
export type InventoryDisplayStatus = 'UNCHECKED' | 'CHECKED_OK' | 'CHECKED_ISSUE';

const KIND_CONFIG: Record<AssetInventoryKind, { assetTable: string; logTable: string }> = {
  pc: { assetTable: 'pc_assets', logTable: 'pc_inventory_log' },
  monitor: { assetTable: 'monitor_assets', logTable: 'monitor_inventory_log' },
};

export function normalizeInventoryStatus(status: any): InventoryDisplayStatus {
  const value = String(status || '').toUpperCase();
  if (value === 'CHECKED_OK' || value === 'CHECKED_ISSUE') return value;
  return 'UNCHECKED';
}

export async function syncAssetInventoryState(db: D1Database, kind: AssetInventoryKind, assetIds: number[]) {
  const cfg = KIND_CONFIG[kind];
  const ids = Array.from(new Set((assetIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return;

  const latestStmt = db.prepare(
    `SELECT action, issue_type, created_at
       FROM ${cfg.logTable}
      WHERE asset_id=?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 1`
  );
  const updateStmt = db.prepare(
    `UPDATE ${cfg.assetTable}
        SET inventory_status=?,
            inventory_at=?,
            inventory_issue_type=?,
            updated_at=${sqlNowStored()}
      WHERE id=?`
  );

  for (const assetId of ids) {
    const latest = await latestStmt.bind(assetId).first<any>();
    const action = String(latest?.action || '').toUpperCase();
    const inventoryStatus: InventoryDisplayStatus = action === 'ISSUE'
      ? 'CHECKED_ISSUE'
      : action === 'OK'
        ? 'CHECKED_OK'
        : 'UNCHECKED';
    const inventoryAt = action ? String(latest?.created_at || '') || null : null;
    const inventoryIssueType = action === 'ISSUE' ? String(latest?.issue_type || '').toUpperCase() || null : null;
    await updateStmt.bind(inventoryStatus, inventoryAt, inventoryIssueType, assetId).run();
  }
}

export async function queryInventorySummaryByWhere(
  db: D1Database,
  tableWithAlias: string,
  query: Pick<QueryParts, 'where' | 'binds' | 'joins'>,
) {
  const rows = await db.prepare(
    `SELECT COALESCE(a.inventory_status, 'UNCHECKED') AS inventory_status, COUNT(*) AS c
       FROM ${tableWithAlias}
       ${query.joins || ''}
       ${query.where}
      GROUP BY COALESCE(a.inventory_status, 'UNCHECKED')`
  ).bind(...query.binds).all<any>();

  const summary = {
    unchecked: 0,
    checked_ok: 0,
    checked_issue: 0,
    total: 0,
  };

  for (const row of rows.results || []) {
    const key = normalizeInventoryStatus((row as any)?.inventory_status);
    const count = Number((row as any)?.c || 0);
    summary.total += count;
    if (key === 'CHECKED_OK') summary.checked_ok += count;
    else if (key === 'CHECKED_ISSUE') summary.checked_issue += count;
    else summary.unchecked += count;
  }

  return summary;
}
