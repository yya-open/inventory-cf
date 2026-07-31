import { sqlNowStored } from "../_time";
import { throwHttpError } from "../_error";
import { GuardRollbackError, guardSql, runBatchWithGuard } from "../_write";
import { invalidateInventorySummaryCache } from "./asset-inventory-summary-cache";

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

const INVENTORY_BATCH_RECENT_HISTORY_LIMIT = 0;
const INVENTORY_BATCH_RETENTION_LIMIT = INVENTORY_BATCH_RECENT_HISTORY_LIMIT + 1;

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
  snapshot_object_key: string | null;
  snapshot_file_size: number | null;
  snapshot_exported_at: string | null;
  updated_at: string | null;
  snapshot_job_meta?: {
    id: number;
    message: string | null;
    started_at: string | null;
    finished_at: string | null;
    retry_count: number;
    max_retries: number;
  } | null;
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
  const cfg = KIND_CONFIG[kind];
  const result = await db.prepare(`DELETE FROM ${cfg.logTable}`).run();
  return Number(
    (result as any)?.meta?.changes ?? (result as any)?.changes ?? 0,
  );
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
    snapshot_object_key: row.snapshot_object_key ? String(row.snapshot_object_key) : null,
    snapshot_file_size: row.snapshot_file_size == null ? null : Number(row.snapshot_file_size || 0),
    snapshot_exported_at: row.snapshot_exported_at ? String(row.snapshot_exported_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    snapshot_job_meta: row.snapshot_job_id ? {
      id: Number(row.snapshot_job_id || 0),
      message: row.snapshot_job_message ? String(row.snapshot_job_message) : null,
      started_at: row.snapshot_job_started_at ? String(row.snapshot_job_started_at) : null,
      finished_at: row.snapshot_job_finished_at ? String(row.snapshot_job_finished_at) : null,
      retry_count: Number(row.snapshot_job_retry_count || 0),
      max_retries: Number(row.snapshot_job_max_retries || 0),
    } : null,
  };
}

async function firstBatchRow(db: D1Database, sql: string, binds: any[]) {
  const selectWithJob = sql.replace('SELECT *', `SELECT b.*, j.message AS snapshot_job_message, j.started_at AS snapshot_job_started_at, j.finished_at AS snapshot_job_finished_at, j.retry_count AS snapshot_job_retry_count, j.max_retries AS snapshot_job_max_retries`).replace('FROM asset_inventory_batch', 'FROM asset_inventory_batch b LEFT JOIN async_jobs j ON j.id = b.snapshot_job_id');
  const normalizedBinds = Array.isArray(binds) ? binds : [];
  try {
    const row = await db.prepare(selectWithJob).bind(...normalizedBinds).first<any>();
    return normalizeBatchRow(row);
  } catch {
    const row = await db.prepare(sql).bind(...normalizedBinds).first<any>();
    return normalizeBatchRow(row);
  }
}

async function allBatchRows(db: D1Database, sql: string, binds: any[]) {
  const selectWithJob = sql.replace('SELECT *', `SELECT b.*, j.message AS snapshot_job_message, j.started_at AS snapshot_job_started_at, j.finished_at AS snapshot_job_finished_at, j.retry_count AS snapshot_job_retry_count, j.max_retries AS snapshot_job_max_retries`).replace('FROM asset_inventory_batch', 'FROM asset_inventory_batch b LEFT JOIN async_jobs j ON j.id = b.snapshot_job_id');
  const normalizedBinds = Array.isArray(binds) ? binds : [];
  try {
    const result = await db.prepare(selectWithJob).bind(...normalizedBinds).all<any>();
    return (result.results || []).map(normalizeBatchRow).filter(Boolean) as AssetInventoryBatchRow[];
  } catch {
    const result = await db.prepare(sql).bind(...normalizedBinds).all<any>();
    return (result.results || []).map(normalizeBatchRow).filter(Boolean) as AssetInventoryBatchRow[];
  }
}

export async function getInventoryBatchSummaryForAssets(
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

export async function getInventoryIssueBreakdownForBatchLogs(
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
             LIMIT ?
          )`,
    )
    .bind(kind, kind, INVENTORY_BATCH_RETENTION_LIMIT)
    .run();
}

export async function getActiveInventoryBatch(
  db: D1Database,
  kind: AssetInventoryKind,
) {
  return firstBatchRow(db, `SELECT *
       FROM asset_inventory_batch
      WHERE kind=? AND status='ACTIVE'
      ORDER BY datetime(started_at) DESC, id DESC
      LIMIT 1`, [kind]);
}

export async function getLatestInventoryBatch(
  db: D1Database,
  kind: AssetInventoryKind,
) {
  return firstBatchRow(db, `SELECT *
       FROM asset_inventory_batch
      WHERE kind=?
      ORDER BY (CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END), datetime(started_at) DESC, id DESC
      LIMIT 1`, [kind]);
}

export async function listRecentInventoryBatches(
  db: D1Database,
  kind: AssetInventoryKind,
  limit = INVENTORY_BATCH_RECENT_HISTORY_LIMIT,
) {
  const take = Math.max(0, Math.min(INVENTORY_BATCH_RECENT_HISTORY_LIMIT, Number(limit) || INVENTORY_BATCH_RECENT_HISTORY_LIMIT));
  if (take <= 0) return [];
  return allBatchRows(db, `SELECT *
       FROM asset_inventory_batch
      WHERE kind=?
      ORDER BY (CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END), datetime(started_at) DESC, id DESC
      LIMIT ? OFFSET 1`, [kind, take]);
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
  const cfg = KIND_CONFIG[kind];
  const normalizedName = String(name || '').trim() || await buildDefaultBatchName(db, kind);
  const existingActive = await getActiveInventoryBatch(db, kind);

  // 「关旧批次 + 开新批次 + 资产表重置」必须同事务，否则中途失败会留下
  // ACTIVE 批次与资产批次归属不一致（或半重置）的脏状态。
  const stmts: D1PreparedStatement[] = [];

  // 1) 结束上一轮 ACTIVE 批次（含汇总快照）
  if (existingActive?.id) {
    const close = await buildCloseInventoryBatchStatements(db, kind, createdBy, existingActive.id);
    stmts.push(...close.stmts);
  }

  // 2) 兜底：同一类型只允许一条 ACTIVE 批次。历史脏数据可能残留多条 ACTIVE，
  //    在同一事务里一并关闭，保证下面用子查询解析新批次 id 时结果唯一。
  stmts.push(
    db
      .prepare(
        `UPDATE asset_inventory_batch
            SET status='CLOSED',
                closed_at=COALESCE(closed_at, ${sqlNowStored()}),
                closed_by=COALESCE(?, closed_by),
                updated_at=${sqlNowStored()}
          WHERE kind=? AND status='ACTIVE'`,
      )
      .bind(createdBy, kind),
  );

  // 3) 开启新批次
  stmts.push(
    db
      .prepare(
        `INSERT INTO asset_inventory_batch (kind, name, status, started_at, created_by, updated_at)
       VALUES (?, ?, 'ACTIVE', ${sqlNowStored()}, ?, ${sqlNowStored()})`,
      )
      .bind(kind, normalizedName, createdBy),
  );

  // 4) 资产表重置为未盘点并挂到新批次。
  //    事务内取不到 last_row_id，改用子查询解析新批次 id（此刻该类型仅有一条 ACTIVE）。
  //    WHERE 只跳过「已经完全处于目标状态」的行：写入结果与整表重写等价，但避免无谓写放大。
  //    批次 id 比较必须用 null 安全的 IS NOT，否则 inventory_batch_id 为 NULL 的行会被漏掉。
  const activeBatchIdSql = `(SELECT id FROM asset_inventory_batch WHERE kind=? AND status='ACTIVE' ORDER BY id DESC LIMIT 1)`;
  stmts.push(
    db
      .prepare(
        `UPDATE ${cfg.assetTable}
            SET inventory_status='UNCHECKED',
                inventory_at=NULL,
                inventory_issue_type=NULL,
                inventory_batch_id=${activeBatchIdSql},
                updated_at=${sqlNowStored()}
          WHERE inventory_status IS NOT 'UNCHECKED'
             OR inventory_at IS NOT NULL
             OR inventory_issue_type IS NOT NULL
             OR inventory_batch_id IS NOT ${activeBatchIdSql}`,
      )
      .bind(kind, kind),
  );

  // 5) 守卫行：该类型必须只剩一条 ACTIVE 批次，且资产表没有仍指向旧批次的行；
  //    否则守卫行报错，让整批事务回滚。
  stmts.push(
    db
      .prepare(
        guardSql(`(
             (SELECT COUNT(1) FROM asset_inventory_batch WHERE kind=? AND status='ACTIVE')
             + (SELECT COUNT(1) FROM ${cfg.assetTable} WHERE inventory_batch_id IS NOT ${activeBatchIdSql})
           ) = ?`),
      )
      .bind(kind, kind, 1),
  );

  try {
    await runBatchWithGuard(db, stmts);
  } catch (e) {
    if (e instanceof GuardRollbackError) {
      throwHttpError('开启盘点批次异常，本次已全部回滚（请重试）', 409);
    }
    throw e;
  }

  await invalidateInventorySummaryCache(db, kind);
  await pruneInventoryBatchHistory(db, kind);
  return getActiveInventoryBatch(db, kind);
}

/**
 * 生成「结束盘点批次」的写语句（只读汇总在这里完成，不含缓存失效与历史裁剪）。
 * 抽成语句构造器，便于 startInventoryBatch 把关旧批次拼进自己的事务批次。
 * 目标批次不存在时返回空语句列表（targetId=0）。
 */
export async function buildCloseInventoryBatchStatements(
  db: D1Database,
  kind: AssetInventoryKind,
  closedBy: string | null,
  batchId?: number | null,
): Promise<{ targetId: number; stmts: D1PreparedStatement[] }> {
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
  if (!normalized?.id) return { targetId: 0, stmts: [] };
  const summary = await getInventoryBatchSummaryForAssets(
    db,
    kind,
    normalized.id,
  );
  const issueBreakdown = await getInventoryIssueBreakdownForBatchLogs(db, kind, normalized.id);
  return {
    targetId: normalized.id,
    stmts: [
      db
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
        ),
    ],
  };
}

export async function closeInventoryBatch(
  db: D1Database,
  kind: AssetInventoryKind,
  closedBy: string | null,
  batchId?: number | null,
) {
  const { targetId, stmts } = await buildCloseInventoryBatchStatements(db, kind, closedBy, batchId);
  if (!targetId) return getLatestInventoryBatch(db, kind);
  await runBatchWithGuard(db, stmts);
  await invalidateInventorySummaryCache(db, kind);
  await pruneInventoryBatchHistory(db, kind);
  return getLatestInventoryBatch(db, kind);
}


export async function attachInventoryBatchSnapshotJob(
  db: D1Database,
  kind: AssetInventoryKind,
  batchId: number,
  jobId: number,
) {
  await db
    .prepare(
      `UPDATE asset_inventory_batch
          SET snapshot_job_id=?,
              snapshot_job_status='queued',
              snapshot_error_message=NULL,
              snapshot_filename=NULL,
              snapshot_object_key=NULL,
              snapshot_file_size=NULL,
              snapshot_exported_at=NULL,
              updated_at=${sqlNowStored()}
        WHERE kind=? AND id=?`,
    )
    .bind(Number(jobId || 0) || null, kind, Number(batchId))
    .run();
  return firstBatchRow(db, `SELECT * FROM asset_inventory_batch WHERE kind=? AND id=? LIMIT 1`, [kind, Number(batchId)]);
}

export async function updateInventoryBatchSnapshotJobState(
  db: D1Database,
  batchId: number,
  payload: {
    status?: AssetInventoryBatchSnapshotStatus;
    errorMessage?: string | null;
    filename?: string | null;
    objectKey?: string | null;
    fileSize?: number | null;
    exportedAt?: string | null;
  },
) {
  const status = payload.status ?? null;
  const exportedAt = payload.exportedAt ?? null;
  await db
    .prepare(
      `UPDATE asset_inventory_batch
          SET snapshot_job_status=COALESCE(?, snapshot_job_status),
              snapshot_error_message=?,
              snapshot_filename=COALESCE(?, snapshot_filename),
              snapshot_object_key=CASE
                WHEN ? IS NOT NULL AND TRIM(?)='' THEN NULL
                ELSE COALESCE(?, snapshot_object_key)
              END,
              snapshot_file_size=CASE
                WHEN ? IS NOT NULL AND ? <= 0 THEN NULL
                ELSE COALESCE(?, snapshot_file_size)
              END,
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
      payload.objectKey ?? null,
      payload.objectKey ?? null,
      payload.objectKey ?? null,
      payload.fileSize ?? null,
      payload.fileSize ?? null,
      payload.fileSize ?? null,
      exportedAt,
      exportedAt,
      exportedAt,
      status,
      Number(batchId),
    )
    .run();
}
