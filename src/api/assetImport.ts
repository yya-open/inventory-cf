import { apiPost } from './client';

/** 必须与 functions/api/services/batch-utils.ts 的 ASSET_BATCH_MAX_ROWS 保持一致。 */
export const ASSET_IMPORT_CHUNK_SIZE = 200;

export type AssetImportRowError = { row: number; message: string };

export type AssetImportResult = {
  success: number;
  duplicated: number;
  failed: number;
  errors: AssetImportRowError[];
  /** 非空表示某个分片整体失败,其后的分片未提交 */
  abortedMessage: string;
};

type BatchResponse = {
  success?: number;
  duplicated?: number;
  failed?: number;
  errors?: unknown;
};

function newRequestId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readRowErrors(value: unknown, rowOffset: number): AssetImportRowError[] {
  if (!Array.isArray(value)) return [];
  const errors: AssetImportRowError[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rawRow = 'row' in item ? Number(item.row) : Number.NaN;
    const rawMessage = 'message' in item ? String(item.message ?? '') : '';
    errors.push({
      row: Number.isFinite(rawRow) ? rawRow + rowOffset : rowOffset + 2,
      message: rawMessage || '错误',
    });
  }
  return errors;
}

/**
 * 按后端单批上限分片提交批量导入。
 *
 * 每个分片携带独立的 client_request_id:后端据此派生幂等单号,分片内所有写入在一次
 * db.batch() 中原子提交,重复提交同一分片不会产生重复流水。分片按顺序执行,任一分片
 * 整体失败(例如触发整批回滚)立即停止,已提交的分片保持有效。
 *
 * 行号按分片偏移还原为 Excel 原始行号。
 */
export async function postAssetImportInChunks<T>(path: string, items: T[]): Promise<AssetImportResult> {
  const result: AssetImportResult = { success: 0, duplicated: 0, failed: 0, errors: [], abortedMessage: '' };

  for (let start = 0; start < items.length; start += ASSET_IMPORT_CHUNK_SIZE) {
    const chunk = items.slice(start, start + ASSET_IMPORT_CHUNK_SIZE);
    try {
      const res = await apiPost<BatchResponse>(path, { items: chunk, client_request_id: newRequestId() });
      result.success += Number(res?.success || 0);
      result.duplicated += Number(res?.duplicated || 0);
      result.failed += Number(res?.failed || 0);
      result.errors.push(...readRowErrors(res?.errors, start));
    } catch (e) {
      result.abortedMessage = e instanceof Error ? e.message : '导入中断';
      break;
    }
  }

  return result;
}
