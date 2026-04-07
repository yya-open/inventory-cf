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

export type AssetQrExportProgress = { stage: string; current: number; total: number; detail?: string };
export type AssetQrExportProgressCallback = (progress: AssetQrExportProgress) => void;

export type DownloadQrCardsHtmlFn = (filename: string, title: string, records: AssetQrPrintRecord[], template?: Partial<QrPrintTemplate>, onProgress?: AssetQrExportProgressCallback) => Promise<void>;
export type DownloadQrSheetHtmlFn = (filename: string, title: string, records: AssetQrPrintRecord[], template?: Partial<QrPrintTemplate>, onProgress?: AssetQrExportProgressCallback) => Promise<void>;

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

const QR_LINK_CACHE_PREFIX = 'inventory:asset-qr-link:';
const QR_LINK_CACHE_TTL_MS = 10 * 60_000;
const qrLinkMemoryCache = new Map<number, { url: string; expiresAt: number }>();

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function readCachedQrLink(id: number) {
  const memory = qrLinkMemoryCache.get(id);
  if (memory && memory.expiresAt > Date.now() && memory.url) return memory.url;
  if (!canUseSessionStorage()) return '';
  try {
    const raw = window.sessionStorage.getItem(`${QR_LINK_CACHE_PREFIX}${id}`);
    if (!raw) return '';
    const payload = JSON.parse(raw) as { url?: string; expiresAt?: number };
    if (!payload?.url || Number(payload.expiresAt || 0) <= Date.now()) return '';
    qrLinkMemoryCache.set(id, { url: String(payload.url || ''), expiresAt: Number(payload.expiresAt || 0) });
    return String(payload.url || '');
  } catch {
    return '';
  }
}

function writeCachedQrLink(id: number, url: string) {
  const normalized = String(url || '');
  if (!normalized) return;
  const expiresAt = Date.now() + QR_LINK_CACHE_TTL_MS;
  qrLinkMemoryCache.set(id, { url: normalized, expiresAt });
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(`${QR_LINK_CACHE_PREFIX}${id}`, JSON.stringify({ url: normalized, expiresAt }));
  } catch {}
}


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
  const result = new Map<number, string>();
  const missingIds: number[] = [];
  ids.forEach((id) => {
    const cached = readCachedQrLink(id);
    if (cached) result.set(id, cached);
    else missingIds.push(id);
  });
  if (missingIds.length) {
    const qrLinks = await options.fetchBulkLinks(missingIds);
    (Array.isArray(qrLinks) ? qrLinks : []).forEach((item) => {
      const normalizedId = Number(item.id);
      const normalizedUrl = String(item.url || '');
      if (!Number.isFinite(normalizedId) || !normalizedUrl) return;
      result.set(normalizedId, normalizedUrl);
      writeCachedQrLink(normalizedId, normalizedUrl);
    });
  }
  return result;
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
  onProgress?: AssetQrExportProgressCallback;
}) {
  options.onProgress?.({ stage: '获取二维码链接', current: 0, total: Math.max(1, options.rows.length), detail: '正在批量获取二维码链接…' });
  const qrLinkMap = await fetchAssetQrLinkMap(options);
  const records: AssetQrPrintRecord[] = [];
  const total = Math.max(1, options.rows.length);
  for (let index = 0; index < options.rows.length; index += 1) {
    const row = options.rows[index];
    const record = options.mapPrintRecord(row, qrLinkMap.get(Number(options.getId(row))) || '');
    if (record?.url) records.push(record);
    options.onProgress?.({ stage: '整理导出数据', current: index + 1, total, detail: `已整理 ${index + 1} / ${total} 条记录` });
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
  onProgress?: AssetQrExportProgressCallback;
}) {
  const records = await buildAssetQrPrintRecords({ ...options, onProgress: options.onProgress });
  if (!records.length) return { count: 0, empty: true as const };
  const qrCardUtils = await options.loadQrCardUtils();
  if (options.mode === 'cards') {
    await qrCardUtils.downloadQrCardsHtml(options.filename, options.title, records, options.template, options.onProgress);
  } else {
    await qrCardUtils.downloadQrSheetHtml(options.filename, options.title, records, options.template, options.onProgress);
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
