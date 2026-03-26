import { sqlNowStored } from '../_time';

export type AssetInventoryKind = 'pc' | 'monitor';
export type AssetInventoryBatchStatus = 'ACTIVE' | 'CLOSED';
export type AssetInventoryBatchRow = {
  id: number;
  kind: AssetInventoryKind;
  name: string;
  status: AssetInventoryBatchStatus;
  started_at: string;
  closed_at: string | null;
  created_by: string | null;
  updated_at: string | null;
};

const KIND_CONFIG: Record<AssetInventoryKind, { assetTable: string; logTable: string }> = {
  pc: { assetTable: 'pc_assets', logTable: 'pc_inventory_log' },
  monitor: { assetTable: 'monitor_assets', logTable: 'monitor_inventory_log' },
};

export async function clearInventoryLogsForNewBatch(db: D1Database, kind: AssetInventoryKind) {
  await ensureAssetInventoryBatchSchema(db);
  const cfg = KIND_CONFIG[kind];
  const result = await db.prepare(`DELETE FROM ${cfg.logTable}`).run();
  return Number((result as any)?.meta?.changes ?? (result as any)?.changes ?? 0);
}

let schemaReady = false;
let schemaInit: Promise<void> | null = null;

export async function ensureAssetInventoryBatchSchema(db: D1Database) {
  if (schemaReady) return;
  if (schemaInit) return schemaInit;
  schemaInit = (async () => {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS asset_inventory_batch (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK(kind IN ('pc','monitor')),
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED')),
        started_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
        closed_at TEXT,
        created_by TEXT,
        updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
      )`
    ).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_asset_inventory_batch_kind_status_started ON asset_inventory_batch(kind, status, started_at DESC, id DESC)`).run();

    for (const ddl of [
      `ALTER TABLE pc_assets ADD COLUMN inventory_batch_id INTEGER`,
      `ALTER TABLE monitor_assets ADD COLUMN inventory_batch_id INTEGER`,
      `ALTER TABLE pc_inventory_log ADD COLUMN batch_id INTEGER`,
      `ALTER TABLE monitor_inventory_log ADD COLUMN batch_id INTEGER`,
    ]) {
      try {
        await db.prepare(ddl).run();
      } catch {
        // ignore duplicate-column errors
      }
    }
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_pc_assets_inventory_batch_id ON pc_assets(inventory_batch_id, id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_monitor_assets_inventory_batch_id ON monitor_assets(inventory_batch_id, id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_pc_inventory_log_batch_id_asset_created ON pc_inventory_log(batch_id, asset_id, created_at DESC, id DESC)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_monitor_inventory_log_batch_id_asset_created ON monitor_inventory_log(batch_id, asset_id, created_at DESC, id DESC)`).run();
    schemaReady = true;
  })().finally(() => {
    schemaInit = null;
  });
  return schemaInit;
}

function normalizeBatchRow(row: any): AssetInventoryBatchRow | null {
  if (!row?.id) return null;
  return {
    id: Number(row.id),
    kind: String(row.kind || '') as AssetInventoryKind,
    name: String(row.name || ''),
    status: String(row.status || 'CLOSED') as AssetInventoryBatchStatus,
    started_at: String(row.started_at || ''),
    closed_at: row.closed_at ? String(row.closed_at) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

export async function getActiveInventoryBatch(db: D1Database, kind: AssetInventoryKind) {
  await ensureAssetInventoryBatchSchema(db);
  const row = await db.prepare(
    `SELECT *
       FROM asset_inventory_batch
      WHERE kind=? AND status='ACTIVE'
      ORDER BY datetime(started_at) DESC, id DESC
      LIMIT 1`
  ).bind(kind).first<any>();
  return normalizeBatchRow(row);
}

export async function getLatestInventoryBatch(db: D1Database, kind: AssetInventoryKind) {
  await ensureAssetInventoryBatchSchema(db);
  const row = await db.prepare(
    `SELECT *
       FROM asset_inventory_batch
      WHERE kind=?
      ORDER BY (CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END), datetime(started_at) DESC, id DESC
      LIMIT 1`
  ).bind(kind).first<any>();
  return normalizeBatchRow(row);
}

export async function listRecentInventoryBatches(db: D1Database, kind: AssetInventoryKind, limit = 6) {
  await ensureAssetInventoryBatchSchema(db);
  const result = await db.prepare(
    `SELECT *
       FROM asset_inventory_batch
      WHERE kind=?
      ORDER BY datetime(started_at) DESC, id DESC
      LIMIT ?`
  ).bind(kind, Math.max(1, Math.min(20, Number(limit) || 6))).all<any>();
  return (result.results || []).map(normalizeBatchRow).filter(Boolean) as AssetInventoryBatchRow[];
}

export async function getEffectiveInventoryBatch(db: D1Database, kind: AssetInventoryKind) {
  const active = await getActiveInventoryBatch(db, kind);
  if (active) return active;
  return getLatestInventoryBatch(db, kind);
}

export async function resolveInventoryBatchIdForWrite(db: D1Database, kind: AssetInventoryKind) {
  const batch = await getActiveInventoryBatch(db, kind);
  return batch?.id ? Number(batch.id) : null;
}

export async function startInventoryBatch(db: D1Database, kind: AssetInventoryKind, name: string | null | undefined, createdBy: string | null) {
  await ensureAssetInventoryBatchSchema(db);
  const cfg = KIND_CONFIG[kind];
  const normalizedName = String(name || '').trim() || `${kind === 'pc' ? '电脑' : '显示器'}盘点批次 ${new Date().toISOString().slice(0, 10)}`;
  await db.prepare(
    `UPDATE asset_inventory_batch
        SET status='CLOSED',
            closed_at=COALESCE(closed_at, ${sqlNowStored()}),
            updated_at=${sqlNowStored()}
      WHERE kind=? AND status='ACTIVE'`
  ).bind(kind).run();

  const inserted = await db.prepare(
    `INSERT INTO asset_inventory_batch (kind, name, status, started_at, created_by, updated_at)
     VALUES (?, ?, 'ACTIVE', ${sqlNowStored()}, ?, ${sqlNowStored()})`
  ).bind(kind, normalizedName, createdBy).run();
  const batchId = Number((inserted as any)?.meta?.last_row_id || (inserted as any)?.meta?.lastRowId || 0);

  await db.prepare(
    `UPDATE ${cfg.assetTable}
        SET inventory_status='UNCHECKED',
            inventory_at=NULL,
            inventory_issue_type=NULL,
            inventory_batch_id=?,
            updated_at=${sqlNowStored()}`
  ).bind(batchId).run();

  return getActiveInventoryBatch(db, kind);
}

export async function closeInventoryBatch(db: D1Database, kind: AssetInventoryKind, batchId?: number | null) {
  await ensureAssetInventoryBatchSchema(db);
  if (batchId && Number(batchId) > 0) {
    await db.prepare(
      `UPDATE asset_inventory_batch
          SET status='CLOSED',
              closed_at=COALESCE(closed_at, ${sqlNowStored()}),
              updated_at=${sqlNowStored()}
        WHERE kind=? AND id=?`
    ).bind(kind, Number(batchId)).run();
  } else {
    await db.prepare(
      `UPDATE asset_inventory_batch
          SET status='CLOSED',
              closed_at=COALESCE(closed_at, ${sqlNowStored()}),
              updated_at=${sqlNowStored()}
        WHERE kind=? AND status='ACTIVE'`
    ).bind(kind).run();
  }
  return getLatestInventoryBatch(db, kind);
}
