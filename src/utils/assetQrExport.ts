import { apiPost } from '../api/client';
import type { QrPrintTemplate } from './qrPrintTemplate';

export type AssetQrLinkRow = { id: number; url: string };
export type AssetQrPrintMeta = { label: string; value: string };
export type AssetQrPrintRecord = { title: string; subtitle?: string; meta: AssetQrPrintMeta[]; url: string };

export type ExportToXlsxFn = (options: {
  filename: string;
  sheetName: string;
  headers: Array<{ key: string; title: string }>;
  rows: Array<Record<string, any>>;
}) => void;

export type DownloadQrCardsHtmlFn = (filename: string, title: string, records: AssetQrPrintRecord[], template?: Partial<QrPrintTemplate>) => Promise<void>;
export type DownloadQrSheetHtmlFn = (filename: string, title: string, records: AssetQrPrintRecord[], template?: Partial<QrPrintTemplate>) => Promise<void>;

export type ExcelUtilsModule = {
  exportToXlsx: ExportToXlsxFn;
};

export type QrCardUtilsModule = {
  downloadQrCardsHtml: DownloadQrCardsHtmlFn;
  downloadQrSheetHtml: DownloadQrSheetHtmlFn;
};

export type AssetQrExportJobResult = {
  raw: any;
  jobId: number;
  splitCount: number;
};

function normalizeSelectedIds<T>(rows: T[], getId: (row: T) => number | string) {
  return rows
    .map((row) => Number(getId(row)))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export async function fetchAssetQrLinkMap<T>(options: {
  rows: T[];
  getId: (row: T) => number | string;
  fetchBulkLinks: (ids: Array<number | string>) => Promise<AssetQrLinkRow[]>;
}) {
  const ids = normalizeSelectedIds(options.rows, options.getId);
  if (!ids.length) return new Map<number, string>();
  const qrLinks = await options.fetchBulkLinks(ids);
  return new Map<number, string>(
    (Array.isArray(qrLinks) ? qrLinks : []).map((item) => [Number(item.id), String(item.url || '')] as [number, string])
  );
}

export async function exportAssetQrLinksWorkbook<T>(options: {
  rows: T[];
  getId: (row: T) => number | string;
  fetchBulkLinks: (ids: Array<number | string>) => Promise<AssetQrLinkRow[]>;
  loadExcelUtils: () => Promise<ExcelUtilsModule>;
  filename: string;
  sheetName?: string;
  headers: Array<{ key: string; title: string }>;
  mapWorkbookRow: (row: T, url: string) => Record<string, any>;
}) {
  const { exportToXlsx } = await options.loadExcelUtils();
  const qrLinkMap = await fetchAssetQrLinkMap(options);
  const linkRows = options.rows.map((row) => options.mapWorkbookRow(row, qrLinkMap.get(Number(options.getId(row))) || ''));
  exportToXlsx({
    filename: options.filename,
    sheetName: options.sheetName || '二维码链接',
    headers: options.headers,
    rows: linkRows,
  });
  return { count: linkRows.length };
}

export async function buildAssetQrPrintRecords<T>(options: {
  rows: T[];
  getId: (row: T) => number | string;
  fetchBulkLinks: (ids: Array<number | string>) => Promise<AssetQrLinkRow[]>;
  mapPrintRecord: (row: T, url: string) => AssetQrPrintRecord | null;
}) {
  const qrLinkMap = await fetchAssetQrLinkMap(options);
  const records: AssetQrPrintRecord[] = [];
  for (const row of options.rows) {
    const record = options.mapPrintRecord(row, qrLinkMap.get(Number(options.getId(row))) || '');
    if (record?.url) records.push(record);
  }
  return records;
}

export async function exportAssetQrPrintLocal<T>(options: {
  mode: 'cards' | 'sheet';
  rows: T[];
  getId: (row: T) => number | string;
  fetchBulkLinks: (ids: Array<number | string>) => Promise<AssetQrLinkRow[]>;
  mapPrintRecord: (row: T, url: string) => AssetQrPrintRecord | null;
  loadQrCardUtils: () => Promise<QrCardUtilsModule>;
  filename: string;
  title: string;
  template?: Partial<QrPrintTemplate>;
}) {
  const records = await buildAssetQrPrintRecords(options);
  if (!records.length) return { count: 0, empty: true as const };
  const qrCardUtils = await options.loadQrCardUtils();
  if (options.mode === 'cards') {
    await qrCardUtils.downloadQrCardsHtml(options.filename, options.title, records, options.template);
  } else {
    await qrCardUtils.downloadQrSheetHtml(options.filename, options.title, records, options.template);
  }
  return { count: records.length, empty: false as const };
}

export async function createAssetQrExportJob<T>(options: {
  rows: T[];
  getId: (row: T) => number | string;
  jobType: string;
  template?: Partial<QrPrintTemplate>;
}) {
  const ids = normalizeSelectedIds(options.rows, options.getId);
  const raw = await apiPost('/api/jobs', {
    job_type: options.jobType,
    request_json: {
      ids,
      origin: window.location.origin,
      print_template: options.template,
    },
    retain_days: 7,
    max_retries: 1,
  });
  return {
    raw,
    jobId: Number((raw as any)?.data?.id || (raw as any)?.id || 0),
    splitCount: Number((raw as any)?.data?.split_count || (raw as any)?.split_count || 0),
  } satisfies AssetQrExportJobResult;
}

export function formatAssetQrJobCreatedMessage(result: AssetQrExportJobResult, label: string) {
  if (result.splitCount > 1) {
    return `已自动拆分为 ${result.splitCount} 个异步任务，可在“系统工具 / 异步任务”下载${label}`;
  }
  if (result.jobId > 0) {
    return `任务已创建（#${result.jobId}），可在“系统工具 / 异步任务”下载${label}`;
  }
  return `任务已创建，可在“系统工具 / 异步任务”下载${label}`;
}
