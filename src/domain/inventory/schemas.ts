import type { InventoryIssueBreakdown } from '../../types/assets';
import { asArray, asNullableNumber, asNullableString, asNumber, asObject, asString } from '../../api/schema';
import type { InventoryBatchPayload, InventoryBatchRow, InventoryBatchSnapshotJobMeta, InventoryBatchSnapshotStatus } from '../../api/inventoryBatches';

function normalizeIssueBreakdown(input: unknown): InventoryIssueBreakdown | null {
  if (!input) return null;
  const source = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { return null; } })() : input;
  if (!source || typeof source !== 'object') return null;
  const row = source as Record<string, unknown>;
  return {
    NOT_FOUND: asNumber(row.NOT_FOUND, 0),
    WRONG_LOCATION: asNumber(row.WRONG_LOCATION, 0),
    WRONG_QR: asNumber(row.WRONG_QR, 0),
    WRONG_STATUS: asNumber(row.WRONG_STATUS, 0),
    MISSING: asNumber(row.MISSING, 0),
    OTHER: asNumber(row.OTHER, 0),
  };
}

export function inventoryBatchJobMetaSchema(input: unknown): InventoryBatchSnapshotJobMeta | null {
  if (!input) return null;
  const row = asObject(input, '盘点任务元数据');
  const id = asNullableNumber(row.id);
  if (!id) return null;
  return {
    id,
    message: asNullableString(row.message),
    started_at: asNullableString(row.started_at),
    finished_at: asNullableString(row.finished_at),
    retry_count: asNullableNumber(row.retry_count),
    max_retries: asNullableNumber(row.max_retries),
  };
}

export function inventoryBatchRowSchema(input: unknown): InventoryBatchRow {
  const row = asObject(input, '盘点批次');
  return {
    id: asNumber(row.id, 0),
    kind: asString(row.kind, 'pc') as InventoryBatchRow['kind'],
    name: asString(row.name),
    status: asString(row.status, 'CLOSED') as InventoryBatchRow['status'],
    started_at: asString(row.started_at),
    closed_at: asNullableString(row.closed_at),
    created_by: asNullableString(row.created_by),
    closed_by: asNullableString(row.closed_by),
    summary_total: asNumber(row.summary_total, 0),
    summary_checked_ok: asNumber(row.summary_checked_ok, 0),
    summary_checked_issue: asNumber(row.summary_checked_issue, 0),
    summary_unchecked: asNumber(row.summary_unchecked, 0),
    summary_issue_breakdown: normalizeIssueBreakdown(row.summary_issue_breakdown),
    snapshot_job_id: asNullableNumber(row.snapshot_job_id),
    snapshot_job_status: (asNullableString(row.snapshot_job_status) as InventoryBatchSnapshotStatus) || null,
    snapshot_error_message: asNullableString(row.snapshot_error_message),
    snapshot_filename: asNullableString(row.snapshot_filename),
    snapshot_object_key: asNullableString(row.snapshot_object_key),
    snapshot_file_size: asNullableNumber(row.snapshot_file_size),
    snapshot_exported_at: asNullableString(row.snapshot_exported_at),
    updated_at: asNullableString(row.updated_at),
    snapshot_job_meta: inventoryBatchJobMetaSchema(row.snapshot_job_meta),
  };
}

export function inventoryBatchPayloadSchema(input: unknown): InventoryBatchPayload {
  const row = asObject(input, '盘点批次响应');
  return {
    active: row.active ? inventoryBatchRowSchema(row.active) : null,
    latest: row.latest ? inventoryBatchRowSchema(row.latest) : null,
    recent: asArray(row.recent || [], inventoryBatchRowSchema, '盘点历史列表'),
  };
}
