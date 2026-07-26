import { isApiErrorCode } from '../api/client';
import type { ApiErrorCode } from '../api/client';

export type StocktakeDiffType = 'pending' | 'increase' | 'decrease' | 'same';
export type StocktakeLineFilter = 'all' | 'changed' | 'increase' | 'decrease' | 'pending';

type DiffLine = { counted_qty?: unknown; diff_qty?: unknown };
type MatchLine = DiffLine & { sku?: unknown; name?: unknown };
type StatusRow = { status?: unknown };

export function isCountedEmpty(counted: unknown): boolean {
  return counted === null || counted === undefined || counted === '';
}

// 全组件唯一的差异语义判定入口：一行盘点明细属于哪种差异
export function classifyStocktakeLine(line: DiffLine): StocktakeDiffType {
  if (isCountedEmpty(line?.counted_qty)) return 'pending';
  const diff = Number(line?.diff_qty || 0);
  if (diff > 0) return 'increase';
  if (diff < 0) return 'decrease';
  return 'same';
}

export const STOCKTAKE_DIFF_LABEL: Record<StocktakeDiffType, string> = {
  pending: '未盘',
  increase: '盘盈',
  decrease: '盘亏',
  same: '无差异',
};

// 盘点单状态 → Element tag 类型（列表与详情共用）
export function stocktakeStatusTagType(status: unknown): 'info' | 'warning' | 'success' {
  const s = String(status || '');
  if (s === 'DRAFT') return 'info';
  if (s === 'APPLYING' || s === 'ROLLING') return 'warning';
  return 'success';
}

export function canDeleteStocktake(row: StatusRow): boolean {
  return ['DRAFT', 'APPLIED'].includes(String(row?.status || ''));
}

export function summarizeStocktakeLines(lines: DiffLine[]) {
  const counted = lines.filter((line) => !isCountedEmpty(line?.counted_qty));
  const changed = counted.filter((line) => Number(line?.diff_qty || 0) !== 0);
  return {
    total: lines.length,
    counted: counted.length,
    changed: changed.length,
    increase: changed.filter((line) => Number(line?.diff_qty || 0) > 0).length,
    decrease: changed.filter((line) => Number(line?.diff_qty || 0) < 0).length,
  };
}

export function stocktakeLineMatches(line: MatchLine, keyword: string, filter: StocktakeLineFilter): boolean {
  const k = String(keyword || '').trim().toLowerCase();
  const hitKeyword =
    !k ||
    String(line?.sku || '').toLowerCase().includes(k) ||
    String(line?.name || '').toLowerCase().includes(k);
  if (!hitKeyword) return false;
  const type = classifyStocktakeLine(line);
  if (filter === 'changed') return type === 'increase' || type === 'decrease';
  if (filter === 'increase') return type === 'increase';
  if (filter === 'decrease') return type === 'decrease';
  if (filter === 'pending') return type === 'pending';
  return true;
}

const STOCKTAKE_ERROR_HINTS: Array<[ApiErrorCode, string]> = [
  ['MISSING_STOCKTAKE_ID', '缺少盘点单标识，请刷新后重试'],
  ['STOCKTAKE_NOT_FOUND', '盘点单不存在或已删除，请刷新列表'],
  ['STOCKTAKE_NOT_DRAFT', '当前盘点单不是草稿状态，无法执行该操作'],
  ['STOCKTAKE_ALREADY_APPLIED', '该盘点单已被应用，请先刷新详情'],
  ['STOCKTAKE_NOT_APPLIED', '仅已应用盘点单可撤销'],
  ['STOCKTAKE_INVALID_STATUS', '盘点单状态异常，请刷新后重试'],
  ['STOCKTAKE_STATUS_CHANGED', '盘点单状态已变化，请刷新后重试'],
  ['STOCKTAKE_APPLY_NOT_FINALIZED', '盘点应用未完成，请稍后刷新核对'],
  ['EMPTY_IMPORT_LINES', '导入内容为空，请检查文件后重试'],
  ['EMPTY_SKU', '导入数据缺少有效 SKU，请检查模板内容'],
];

export function stocktakeErrorHint(e: unknown): string {
  for (const [code, hint] of STOCKTAKE_ERROR_HINTS) {
    if (isApiErrorCode(e, code)) return hint;
  }
  return '';
}