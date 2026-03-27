import { sqlNowStored } from "../_time";

export type AssetInventoryKind = "pc" | "monitor";
export type AssetInventoryBatchStatus = "ACTIVE" | "CLOSED";
export type AssetInventoryIssueBreakdown = {
  NOT_FOUND: number;
  WRONG_LOCATION: number;
  WRONG_QR: number;
  WRONG_STATUS: number;
  MISSING: number;
  OTHER: number;
};

export type AssetInventoryBatchSnapshotStatus = 'queued' | 'running' | 'success' | 'failed' | 'canceled' | null;

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
  summary_issue_breakdown: AssetInventoryIssueBreakdown | null;
  snapshot_job_id: number | null;
  snapshot_job_status: AssetInventoryBatchSnapshotStatus;
  snapshot_error_message: string | null;
  snapshot_filename: string | null;
  snapshot_exported_at: string | null;
  updated_at: string | null;
};

const KIND_CONFIG: Record<
  AssetInventoryKind,
  { assetTable: string; logTable: string }
> = {
  pc: { assetTable: "pc_assets", logTable: "pc_inventory_log" },
  monitor: { assetTable: "monitor_assets", logTable: "monitor_inventory_log" },
};

const ISSUE_CODES = ["NOT_FOUND", "WRONG_LOCATION", "WRONG_QR", "WRONG_STATUS", "MISSING", "OTHER"] as const;

function emptyIssueBreakdown(): AssetInventoryIssueBreakdown {
  return {
    NOT_FOUND: 0,
    WRONG_LOCATION: 0,
    WRONG_QR: 0,
    WRONG_STATUS: 0,
    MISSING: 0,
    OTHER: 0,
  };
}

function normalizeIssueBreakdown(input: any): AssetInventoryIssueBreakdown | null {
  if (!input) return null;
  let source = input;
  if (typeof input === 'string') {
    try {
      source = JSON.parse(input);
    } catch {
      return null;
    }
  }
  const base = emptyIssueBreakdown();
  let hasValue = false;
  for (const code of ISSUE_CODES) {
    const value = Number(source?.[code] || 0);
    base[code] = Number.isFinite(value) ? value : 0;
    if (base[code] > 0) hasValue = true;
  }
  return hasValue ? base : base;
}

function todaySqlDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseBatchNameDateSeq(name: string | null | undefined) {
  const text = String(name || '').trim();
  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) return null;
  const seqMatch = text.match(/第\s*(\d+)\s*轮/);
  return { date: dateMatch[1], seq: seqMatch ? Math.max(1, Number(seqMatch[1]) || 1) : 1 };
}

async function buildDefaultBatchName(db: D1Database, kind: AssetInventoryKind) {
  const latest = await db
    .prepare(`SELECT name FROM asset_inventory_batch WHERE kind=? ORDER BY datetime(started_at) DESC, id DESC LIMIT 1`)
    .bind(kind)
    .first<any>();
  const label = kind === 'pc' ? '电脑' : '显示器';
  const dateText = todaySqlDate();
  const parsed = parseBatchNameDateSeq(latest?.name);
  const nextSeq = parsed?.date === dateText ? parsed.seq + 1 : 1;
  return `${label}盘点 ${dateText} 第${nextSeq}轮`;
}

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
        summary_issue_breakdown TEXT,
        snapshot_job_id INTEGER,
        snapshot_job_status TEXT,
        snapshot_error_message TEXT,
        snapshot_filename TEXT,
        snapshot_exported_at TEXT,
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
      `ALTER TABLE asset_inventory_batch ADD COLUMN summary_issue_breakdown TEXT`,
      `ALTER TABLE asset_inventory_batch ADD COLUMN snapshot_job_id INTEGER`,
      `ALTER TABLE asset_inventory_batch ADD COLUMN snapshot_job_status TEXT`,
      `ALTER TABLE asset_inventory_batch ADD COLUMN snapshot_error_message TEXT`,
      `ALTER TABLE asset_inventory_batch ADD COLUMN snapshot_filename TEXT`,
      `ALTER TABLE asset_inventory_batch ADD COLUMN snapshot_exported_at TEXT`,
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
    summary_issue_breakdown: normalizeIssueBreakdown(row.summary_issue_breakdown),
    snapshot_job_id: row.snapshot_job_id ? Number(row.snapshot_job_id) : null,
    snapshot_job_status: row.snapshot_job_status ? String(row.snapshot_job_status) as AssetInventoryBatchSnapshotStatus : null,
    snapshot_error_message: row.snapshot_error_message ? String(row.snapshot_error_message) : null,
    snapshot_filename: row.snapshot_filename ? String(row.snapshot_filename) : null,
    snapshot_exported_at: row.snapshot_exported_at ? String(row.snapshot_exported_at) : null,
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

async function getInventoryIssueBreakdownForBatchLogs(
  db: D1Database,
  kind: AssetInventoryKind,
  batchId: number,
) {
  const cfg = KIND_CONFIG[kind];
  const result = await db
    .prepare(
      `SELECT UPPER(COALESCE(issue_type, 'OTHER')) AS issue_type, COUNT(1) AS total
         FROM ${cfg.logTable}
        WHERE batch_id=? AND UPPER(COALESCE(action,''))='ISSUE'
        GROUP BY UPPER(COALESCE(issue_type, 'OTHER'))`,
    )
    .bind(batchId)
    .all<any>();
  const breakdown = emptyIssueBreakdown();
  for (const row of result.results || []) {
    const key = String(row?.issue_type || 'OTHER').toUpperCase();
    const target = ISSUE_CODES.includes(key as any) ? key : 'OTHER';
    breakdown[target as keyof AssetInventoryIssueBreakdown] = Number(row?.total || 0);
  }
  return breakdown;
}

async function pruneInventoryBatchHistory(
  db: D1Database,
  kind: AssetInventoryKind,
) {
  await db
    .prepare(
      `DELETE FROM asset_inventory_batch
        WHERE kind=?
          AND id NOT IN (
            SELECT id FROM asset_inventory_batch
             WHERE kind=?
             ORDER BY (CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END), datetime(started_at) DESC, id DESC
             LIMIT 2
          )`,
    )
    .bind(kind, kind)
    .run();
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
  limit = 1,
) {
  await ensureAssetInventoryBatchSchema(db);
  const take = Math.max(1, Math.min(5, Number(limit) || 1));
  const result = await db
    .prepare(
      `SELECT *
       FROM asset_inventory_batch
      WHERE kind=?
      ORDER BY (CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END), datetime(started_at) DESC, id DESC
      LIMIT ? OFFSET 1`,
    )
    .bind(kind, take)
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
  const normalizedName = String(name || '').trim() || await buildDefaultBatchName(db, kind);
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

  await pruneInventoryBatchHistory(db, kind);
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
  const issueBreakdown = await getInventoryIssueBreakdownForBatchLogs(db, kind, normalized.id);
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
            summary_issue_breakdown=?,
            updated_at=${sqlNowStored()}
      WHERE kind=? AND id=?`,
    )
    .bind(
      closedBy,
      summary.total,
      summary.checked_ok,
      summary.checked_issue,
      summary.unchecked,
      JSON.stringify(issueBreakdown),
      kind,
      normalized.id,
    )
    .run();
  await pruneInventoryBatchHistory(db, kind);
  return getLatestInventoryBatch(db, kind);
}


export async function attachInventoryBatchSnapshotJob(
  db: D1Database,
  kind: AssetInventoryKind,
  batchId: number,
  jobId: number,
) {
  await ensureAssetInventoryBatchSchema(db);
  await db
    .prepare(
      `UPDATE asset_inventory_batch
          SET snapshot_job_id=?,
              snapshot_job_status='queued',
              snapshot_error_message=NULL,
              snapshot_filename=NULL,
              snapshot_exported_at=NULL,
              updated_at=${sqlNowStored()}
        WHERE kind=? AND id=?`,
    )
    .bind(Number(jobId || 0) || null, kind, Number(batchId))
    .run();
  const row = await db
    .prepare(`SELECT * FROM asset_inventory_batch WHERE kind=? AND id=? LIMIT 1`)
    .bind(kind, Number(batchId))
    .first<any>();
  return normalizeBatchRow(row);
}

export async function updateInventoryBatchSnapshotJobState(
  db: D1Database,
  batchId: number,
  payload: {
    status?: AssetInventoryBatchSnapshotStatus;
    errorMessage?: string | null;
    filename?: string | null;
    exportedAt?: string | null;
  },
) {
  await ensureAssetInventoryBatchSchema(db);
  const status = payload.status ?? null;
  const exportedAt = payload.exportedAt ?? null;
  await db
    .prepare(
      `UPDATE asset_inventory_batch
          SET snapshot_job_status=COALESCE(?, snapshot_job_status),
              snapshot_error_message=?,
              snapshot_filename=COALESCE(?, snapshot_filename),
              snapshot_exported_at=CASE
                WHEN ? IS NOT NULL AND TRIM(?)<>'' THEN ?
                WHEN ?='success' AND COALESCE(snapshot_exported_at,'')='' THEN ${sqlNowStored()}
                ELSE snapshot_exported_at
              END,
              updated_at=${sqlNowStored()}
        WHERE id=?`,
    )
    .bind(
      status,
      payload.errorMessage ?? null,
      payload.filename ?? null,
      exportedAt,
      exportedAt,
      exportedAt,
      status,
      Number(batchId),
    )
    .run();
}
