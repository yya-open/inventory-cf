import { sqlNowStored } from "../_time";

export type AssetInventoryKind = "pc" | "monitor";
export type AssetInventoryBatchStatus = "ACTIVE" | "CLOSED";
export type AssetInventoryBatchRow = {
  id: number;
  kind: AssetInventoryKind;
  name: string;
  status: AssetInventoryBatchStatus;
  started_at: string;
  closed_at: string | null;
  created_by: string | null;
  closed_by: string | null;
  summary_total: number;
  summary_checked_ok: number;
  summary_checked_issue: number;
  summary_unchecked: number;
  updated_at: string | null;
};

const KIND_CONFIG: Record<
  AssetInventoryKind,
  { assetTable: string; logTable: string }
> = {
  pc: { assetTable: "pc_assets", logTable: "pc_inventory_log" },
  monitor: { assetTable: "monitor_assets", logTable: "monitor_inventory_log" },
};

export async function clearInventoryLogsForNewBatch(
  db: D1Database,
  kind: AssetInventoryKind,
) {
  await ensureAssetInventoryBatchSchema(db);
  const cfg = KIND_CONFIG[kind];
  const result = await db.prepare(`DELETE FROM ${cfg.logTable}`).run();
  return Number(
    (result as any)?.meta?.changes ?? (result as any)?.changes ?? 0,
  );
}

let schemaReady = false;
let schemaInit: Promise<void> | null = null;

export async function ensureAssetInventoryBatchSchema(db: D1Database) {
  if (schemaReady) return;
  if (schemaInit) return schemaInit;
  schemaInit = (async () => {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS asset_inventory_batch (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK(kind IN ('pc','monitor')),
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED')),
        started_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
        closed_at TEXT,
        created_by TEXT,
        closed_by TEXT,
        summary_total INTEGER NOT NULL DEFAULT 0,
        summary_checked_ok INTEGER NOT NULL DEFAULT 0,
        summary_checked_issue INTEGER NOT NULL DEFAULT 0,
        summary_unchecked INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
      )`,
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_asset_inventory_batch_kind_status_started ON asset_inventory_batch(kind, status, started_at DESC, id DESC)`,
      )
      .run();

    for (const ddl of [
      `ALTER TABLE asset_inventory_batch ADD COLUMN closed_by TEXT`,
      `ALTER TABLE asset_inventory_batch ADD COLUMN summary_total INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE asset_inventory_batch ADD COLUMN summary_checked_ok INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE asset_inventory_batch ADD COLUMN summary_checked_issue INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE asset_inventory_batch ADD COLUMN summary_unchecked INTEGER NOT NULL DEFAULT 0`,
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
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_pc_assets_inventory_batch_id ON pc_assets(inventory_batch_id, id)`,
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_monitor_assets_inventory_batch_id ON monitor_assets(inventory_batch_id, id)`,
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_pc_inventory_log_batch_id_asset_created ON pc_inventory_log(batch_id, asset_id, created_at DESC, id DESC)`,
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_monitor_inventory_log_batch_id_asset_created ON monitor_inventory_log(batch_id, asset_id, created_at DESC, id DESC)`,
      )
      .run();
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
    kind: String(row.kind || "") as AssetInventoryKind,
    name: String(row.name || ""),
    status: String(row.status || "CLOSED") as AssetInventoryBatchStatus,
    started_at: String(row.started_at || ""),
    closed_at: row.closed_at ? String(row.closed_at) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    closed_by: row.closed_by ? String(row.closed_by) : null,
    summary_total: Number(row.summary_total || 0),
    summary_checked_ok: Number(row.summary_checked_ok || 0),
    summary_checked_issue: Number(row.summary_checked_issue || 0),
    summary_unchecked: Number(row.summary_unchecked || 0),
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

async function getInventoryBatchSummaryForAssets(
  db: D1Database,
  kind: AssetInventoryKind,
  batchId: number,
) {
  const cfg = KIND_CONFIG[kind];
  const row = await db
    .prepare(
      `SELECT
       COUNT(1) AS total,
       SUM(CASE WHEN UPPER(COALESCE(inventory_status,''))='CHECKED_OK' THEN 1 ELSE 0 END) AS checked_ok,
       SUM(CASE WHEN UPPER(COALESCE(inventory_status,''))='CHECKED_ISSUE' THEN 1 ELSE 0 END) AS checked_issue,
       SUM(CASE WHEN UPPER(COALESCE(inventory_status,''))='UNCHECKED' OR COALESCE(inventory_status,'')='' THEN 1 ELSE 0 END) AS unchecked
     FROM ${cfg.assetTable}
     WHERE inventory_batch_id=?`,
    )
    .bind(batchId)
    .first<any>();
  return {
    total: Number(row?.total || 0),
    checked_ok: Number(row?.checked_ok || 0),
    checked_issue: Number(row?.checked_issue || 0),
    unchecked: Number(row?.unchecked || 0),
  };
}

export async function getActiveInventoryBatch(
  db: D1Database,
  kind: AssetInventoryKind,
) {
  await ensureAssetInventoryBatchSchema(db);
  const row = await db
    .prepare(
      `SELECT *
       FROM asset_inventory_batch
      WHERE kind=? AND status='ACTIVE'
      ORDER BY datetime(started_at) DESC, id DESC
      LIMIT 1`,
    )
    .bind(kind)
    .first<any>();
  return normalizeBatchRow(row);
}

export async function getLatestInventoryBatch(
  db: D1Database,
  kind: AssetInventoryKind,
) {
  await ensureAssetInventoryBatchSchema(db);
  const row = await db
    .prepare(
      `SELECT *
       FROM asset_inventory_batch
      WHERE kind=?
      ORDER BY (CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END), datetime(started_at) DESC, id DESC
      LIMIT 1`,
    )
    .bind(kind)
    .first<any>();
  return normalizeBatchRow(row);
}

export async function listRecentInventoryBatches(
  db: D1Database,
  kind: AssetInventoryKind,
  limit = 6,
) {
  await ensureAssetInventoryBatchSchema(db);
  const result = await db
    .prepare(
      `SELECT *
       FROM asset_inventory_batch
      WHERE kind=?
      ORDER BY datetime(started_at) DESC, id DESC
      LIMIT ?`,
    )
    .bind(kind, Math.max(1, Math.min(20, Number(limit) || 6)))
    .all<any>();
  return (result.results || [])
    .map(normalizeBatchRow)
    .filter(Boolean) as AssetInventoryBatchRow[];
}

export async function getEffectiveInventoryBatch(
  db: D1Database,
  kind: AssetInventoryKind,
) {
  const active = await getActiveInventoryBatch(db, kind);
  if (active) return active;
  return getLatestInventoryBatch(db, kind);
}

export async function resolveInventoryBatchIdForWrite(
  db: D1Database,
  kind: AssetInventoryKind,
) {
  const batch = await getActiveInventoryBatch(db, kind);
  return batch?.id ? Number(batch.id) : null;
}

export async function startInventoryBatch(
  db: D1Database,
  kind: AssetInventoryKind,
  name: string | null | undefined,
  createdBy: string | null,
) {
  await ensureAssetInventoryBatchSchema(db);
  const cfg = KIND_CONFIG[kind];
  const normalizedName =
    String(name || "").trim() ||
    `${kind === "pc" ? "电脑" : "显示器"}盘点批次 ${new Date().toISOString().slice(0, 10)}`;
  const existingActive = await getActiveInventoryBatch(db, kind);
  if (existingActive?.id) {
    await closeInventoryBatch(db, kind, createdBy, existingActive.id);
  }

  const inserted = await db
    .prepare(
      `INSERT INTO asset_inventory_batch (kind, name, status, started_at, created_by, updated_at)
     VALUES (?, ?, 'ACTIVE', ${sqlNowStored()}, ?, ${sqlNowStored()})`,
    )
    .bind(kind, normalizedName, createdBy)
    .run();
  const batchId = Number(
    (inserted as any)?.meta?.last_row_id ||
      (inserted as any)?.meta?.lastRowId ||
      0,
  );

  await db
    .prepare(
      `UPDATE ${cfg.assetTable}
        SET inventory_status='UNCHECKED',
            inventory_at=NULL,
            inventory_issue_type=NULL,
            inventory_batch_id=?,
            updated_at=${sqlNowStored()}`,
    )
    .bind(batchId)
    .run();

  return getActiveInventoryBatch(db, kind);
}

export async function closeInventoryBatch(
  db: D1Database,
  kind: AssetInventoryKind,
  closedBy: string | null,
  batchId?: number | null,
) {
  await ensureAssetInventoryBatchSchema(db);
  const target =
    batchId && Number(batchId) > 0
      ? await db
          .prepare(
            `SELECT * FROM asset_inventory_batch WHERE kind=? AND id=? LIMIT 1`,
          )
          .bind(kind, Number(batchId))
          .first<any>()
      : await db
          .prepare(
            `SELECT * FROM asset_inventory_batch WHERE kind=? AND status='ACTIVE' ORDER BY datetime(started_at) DESC, id DESC LIMIT 1`,
          )
          .bind(kind)
          .first<any>();
  const normalized = normalizeBatchRow(target);
  if (!normalized?.id) return getLatestInventoryBatch(db, kind);
  const summary = await getInventoryBatchSummaryForAssets(
    db,
    kind,
    normalized.id,
  );
  await db
    .prepare(
      `UPDATE asset_inventory_batch
        SET status='CLOSED',
            closed_at=COALESCE(closed_at, ${sqlNowStored()}),
            closed_by=COALESCE(?, closed_by),
            summary_total=?,
            summary_checked_ok=?,
            summary_checked_issue=?,
            summary_unchecked=?,
            updated_at=${sqlNowStored()}
      WHERE kind=? AND id=?`,
    )
    .bind(
      closedBy,
      summary.total,
      summary.checked_ok,
      summary.checked_issue,
      summary.unchecked,
      kind,
      normalized.id,
    )
    .run();
  return getLatestInventoryBatch(db, kind);
}
