import type { QueryParts } from './asset-ledger';
import { sqlNowStored } from '../_time';
import { ensureAssetInventoryBatchSchema, getEffectiveInventoryBatch, type AssetInventoryKind as InventoryBatchKind } from './asset-inventory-batches';

export type AssetInventoryKind = InventoryBatchKind;
export type InventoryDisplayStatus = 'UNCHECKED' | 'CHECKED_OK' | 'CHECKED_ISSUE';

const KIND_CONFIG: Record<AssetInventoryKind, { assetTable: string; logTable: string }> = {
  pc: { assetTable: 'pc_assets', logTable: 'pc_inventory_log' },
  monitor: { assetTable: 'monitor_assets', logTable: 'monitor_inventory_log' },
};

const INVENTORY_SYNC_CHUNK_SIZE = 200;

export function normalizeInventoryStatus(status: any): InventoryDisplayStatus {
  const value = String(status || '').toUpperCase();
  if (value === 'CHECKED_OK' || value === 'CHECKED_ISSUE') return value;
  return 'UNCHECKED';
}

function chunkIds(ids: number[], size = INVENTORY_SYNC_CHUNK_SIZE) {
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}

async function loadLatestInventoryLogs(
  db: D1Database,
  logTable: string,
  assetIds: number[],
  batchId?: number | null,
) {
  if (!assetIds.length) return new Map<number, any>();
  const placeholders = assetIds.map(() => '?').join(',');
  const binds: any[] = [...assetIds];
  let batchWhere = '';
  if (batchId) {
    batchWhere = ' AND batch_id=?';
    binds.push(batchId);
  }
  const { results } = await db.prepare(
    `SELECT asset_id, action, issue_type, created_at, batch_id
       FROM (
         SELECT asset_id, action, issue_type, created_at, batch_id,
                ROW_NUMBER() OVER (
                  PARTITION BY asset_id
                  ORDER BY datetime(created_at) DESC, id DESC
                ) AS rn
           FROM ${logTable}
          WHERE asset_id IN (${placeholders})${batchWhere}
       ) t
      WHERE rn=1`
  ).bind(...binds).all<any>();
  const latestByAssetId = new Map<number, any>();
  for (const row of results || []) {
    const assetId = Number((row as any)?.asset_id || 0);
    if (assetId > 0) latestByAssetId.set(assetId, row);
  }
  return latestByAssetId;
}

export async function syncAssetInventoryState(db: D1Database, kind: AssetInventoryKind, assetIds: number[]) {
  await ensureAssetInventoryBatchSchema(db);
  const cfg = KIND_CONFIG[kind];
  const ids = Array.from(new Set((assetIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return;

  const effectiveBatch = await getEffectiveInventoryBatch(db, kind);
  const updateStmt = db.prepare(
    `UPDATE ${cfg.assetTable}
        SET inventory_status=?,
            inventory_at=?,
            inventory_issue_type=?,
            inventory_batch_id=?,
            updated_at=${sqlNowStored()}
      WHERE id=?`
  );

  for (const chunk of chunkIds(ids)) {
    const latestByAssetId = await loadLatestInventoryLogs(db, cfg.logTable, chunk, effectiveBatch?.id || null);
    const statements: D1PreparedStatement[] = [];
    for (const assetId of chunk) {
      const latest = latestByAssetId.get(assetId);
      const action = String(latest?.action || '').toUpperCase();
      const inventoryStatus: InventoryDisplayStatus = action === 'ISSUE'
        ? 'CHECKED_ISSUE'
        : action === 'OK'
          ? 'CHECKED_OK'
          : 'UNCHECKED';
      const inventoryAt = action ? String(latest?.created_at || '') || null : null;
      const inventoryIssueType = action === 'ISSUE' ? String(latest?.issue_type || '').toUpperCase() || null : null;
      const inventoryBatchId = action ? Number(latest?.batch_id || effectiveBatch?.id || 0) || null : (effectiveBatch?.id || null);
      statements.push(updateStmt.bind(inventoryStatus, inventoryAt, inventoryIssueType, inventoryBatchId, assetId));
    }
    if (statements.length) await db.batch(statements);
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
