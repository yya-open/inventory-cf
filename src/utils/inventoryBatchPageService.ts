import { closeInventoryBatch, startInventoryBatch, type InventoryBatchKind, type InventoryBatchPayload } from '../api/inventoryBatches';
import type { AssetInventorySummary } from '../types/assets';
import { formatBeijingDateTime } from './datetime';
import { exportInventoryLogsBeforeBatch } from './inventoryBatchExport';
import { buildSuggestedInventoryBatchName } from './inventoryBatchNaming';

export type InventoryBatchStartPreview = {
  assetTotal: number;
  checkedOk: number;
  checkedIssue: number;
  unchecked: number;
  logTotal: number;
  activeName: string;
};

export function createInventoryBatchStartPreview(assetTotal: number, logTotal: number, summary: AssetInventorySummary, activeName?: string | null): InventoryBatchStartPreview {
  return {
    assetTotal: Number(assetTotal || 0),
    checkedOk: Number(summary?.checked_ok || 0),
    checkedIssue: Number(summary?.checked_issue || 0),
    unchecked: Number(summary?.unchecked || 0),
    logTotal: Number(logTotal || 0),
    activeName: activeName || '',
  };
}

export function suggestInventoryBatchName(kind: InventoryBatchKind, inventoryBatch: InventoryBatchPayload) {
  return buildSuggestedInventoryBatchName(kind, [inventoryBatch.active?.name, inventoryBatch.latest?.name, ...(inventoryBatch.recent || []).map((item) => item?.name)]);
}

export function buildBatchExportTimestamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${hh}${mm}`;
}

export async function executeInventoryBatchStart(kind: InventoryBatchKind, name: string, options: { clearPreviousLogs?: boolean } = {}) {
  await exportInventoryLogsBeforeBatch(kind);
  return startInventoryBatch(kind, name, options);
}

export async function exportInventoryBatchClosingWorkbook<Row, Filters>(args: {
  activeName: string;
  filenamePrefix: string;
  baseFilters: Filters;
  fetchRows: (filters: Filters, pageSize?: number) => Promise<Row[]>;
  filtersForStatus: (base: Filters, inventoryStatus: string) => Filters;
  loadExcelUtils: () => Promise<{ exportWorkbookXlsx: (input: any) => Promise<void> }>;
  headers: Array<{ key: string; title: string }>;
  mapRows: (rows: Row[]) => any[];
}) {
  const [checkedRows, uncheckedRows, issueRows] = await Promise.all([
    args.fetchRows(args.filtersForStatus(args.baseFilters, 'CHECKED_OK'), 300),
    args.fetchRows(args.filtersForStatus(args.baseFilters, 'UNCHECKED'), 300),
    args.fetchRows(args.filtersForStatus(args.baseFilters, 'CHECKED_ISSUE'), 300),
  ]);
  const filename = `${String(args.filenamePrefix || args.activeName || '盘点结果').replace(/[\/:*?"<>|]/g, '_')}_${buildBatchExportTimestamp()}_盘点结果.xlsx`;
  const { exportWorkbookXlsx } = await args.loadExcelUtils();
  await exportWorkbookXlsx({
    filename,
    sheets: [
      {
        sheetName: '汇总',
        rows: [
          { 项目: '盘点批次', 内容: args.activeName || '-' },
          { 项目: '导出时间', 内容: formatBeijingDateTime(new Date().toISOString()) },
          { 项目: '已盘', 内容: checkedRows.length },
          { 项目: '未盘', 内容: uncheckedRows.length },
          { 项目: '异常', 内容: issueRows.length },
          { 项目: '设备总数', 内容: checkedRows.length + uncheckedRows.length + issueRows.length },
        ],
      },
      { sheetName: '已盘', headers: args.headers, rows: args.mapRows(checkedRows) },
      { sheetName: '未盘', headers: args.headers, rows: args.mapRows(uncheckedRows) },
      { sheetName: '异常', headers: args.headers, rows: args.mapRows(issueRows) },
    ],
  });
  return { filename, checked: checkedRows.length, unchecked: uncheckedRows.length, issue: issueRows.length };
}

export async function executeInventoryBatchClose(kind: InventoryBatchKind, id: number, snapshotFilename: string | null) {
  return closeInventoryBatch(kind, id, { snapshotFilename });
}
