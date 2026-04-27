import { sqlNowStored } from '../_time';
import { ensurePcQrColumns } from '../_pc';
import { ensureMonitorQrColumns } from '../_monitor';
import { initMissingAssetQrKeys } from './asset-qr';
import { countAuditRows, listAuditRows, parseAuditListFilters } from './audit-log';
import { buildPcAssetQuery, countByWhere, listPcAssets, type QueryParts } from './asset-ledger';
import { updateInventoryBatchSnapshotJobState, type AssetInventoryKind } from './asset-inventory-batches';
import { precomputeDashboardSnapshots } from './dashboard-report';
import { getAutoRepairScan } from './ops-tools';
import QRCode from 'qrcode';
import { normalizeQrPrintTemplate, resolveQrPaperDimensions, type QrPrintTemplate, type QrPrintTemplateKind } from './qr-print-template';
import { buildMonitorQrRecords, buildPcQrRecords, type QrCardRecord } from './qr-export-records';
import * as XLSX from 'xlsx';
import { buildBackupFilename, buildBackupPayload, createBackupJsonStream, parseBackupOptions } from '../admin/_backup_helpers';
import { deleteAuditRowsByIds, recordAuditArchiveRun } from '../_audit';

export type AsyncJobType = 'AUDIT_EXPORT' | 'AUDIT_ARCHIVE_EXPORT' | 'BACKUP_EXPORT' | 'PC_AGE_WARNING_EXPORT' | 'DASHBOARD_PRECOMPUTE' | 'OPS_SCAN_REFRESH' | 'PC_QR_KEY_INIT' | 'MONITOR_QR_KEY_INIT' | 'PC_QR_CARDS_EXPORT' | 'PC_QR_SHEET_EXPORT' | 'MONITOR_QR_CARDS_EXPORT' | 'MONITOR_QR_SHEET_EXPORT' | 'ASSET_INVENTORY_BATCH_SNAPSHOT_EXPORT';
export type AsyncJobStatus = 'queued' | 'running' | 'success' | 'failed' | 'canceled';

export async function ensureAsyncJobsTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS async_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      created_by INTEGER,
      created_by_name TEXT,
      permission_scope TEXT,
      request_json TEXT,
      result_text TEXT,
      result_blob_base64 TEXT,
      result_object_key TEXT,
      result_file_size INTEGER,
      result_content_type TEXT,
      result_filename TEXT,
      message TEXT,
      error_text TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT (${sqlNowStored()}),
      updated_at TEXT NOT NULL DEFAULT (${sqlNowStored()})
    )`
  ).run();
  const alters = [
    `ALTER TABLE async_jobs ADD COLUMN result_blob_base64 TEXT`,
    `ALTER TABLE async_jobs ADD COLUMN result_object_key TEXT`,
    `ALTER TABLE async_jobs ADD COLUMN result_file_size INTEGER`,
    `ALTER TABLE async_jobs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE async_jobs ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE async_jobs ADD COLUMN cancel_requested INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE async_jobs ADD COLUMN canceled_at TEXT`,
    `ALTER TABLE async_jobs ADD COLUMN retain_until TEXT`,
    `ALTER TABLE async_jobs ADD COLUMN result_deleted_at TEXT`,
  ];
  for (const sql of alters) {
    try { await db.prepare(sql).run(); } catch {}
  }
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_async_jobs_status_created_at ON async_jobs(status, created_at DESC, id DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_async_jobs_created_by_status ON async_jobs(created_by, status, id DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_async_jobs_retain_until ON async_jobs(retain_until, id DESC)`).run();
}

function csvEscape(v: any) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}


function escapeHtml(value: any) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value: any) {
  return escapeHtml(value);
}

function escapeAttr(value: any) {
  return escapeHtml(value);
}

function normalizeJobAssetIds(input: any, limit = 500) {
  const set = new Set<number>();
  for (const value of Array.isArray(input) ? input : []) {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) continue;
    set.add(Math.trunc(id));
    if (set.size >= limit) break;
  }
  return Array.from(set);
}

type PreparedQrCardRecord = QrCardRecord & { svg: string };

function inlineSvgMarkup(svg: string, attrs: Record<string, string | number> = {}) {
  const cleaned = String(svg || '').trim().replace(/^<\?xml[^>]*>\s*/i, '');
  if (!cleaned) return '';
  const attrText = Object.entries(attrs)
    .filter(([, value]) => value !== '' && value != null)
    .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
    .join(' ');
  return cleaned.replace(/<svg\b([^>]*)>/i, (_all, rest) => {
    const extra = attrText ? ` ${attrText}` : '';
    return `<svg${rest}${extra}>`;
  });
}

async function prepareQrCards(records: QrCardRecord[]) {
  return Promise.all(records.map(async (record) => ({
    ...record,
    svg: await QRCode.toString(record.url, { type: 'svg', width: 220, margin: 1, errorCorrectionLevel: 'Q' }),
  })));
}

function chunkRecords<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function renderCardMeta(meta?: Array<{ label: string; value: string }>, limit = 4) {
  return (meta || []).slice(0, limit).map((item) => `
      <div class="meta-row"><span class="k">${escapeHtml(item.label)}</span><span class="v">${escapeHtml(item.value)}</span></div>`).join('');
}

function buildLayoutVars(kind: QrPrintTemplateKind, template: QrPrintTemplate) {
  const { widthMm, heightMm } = resolveQrPaperDimensions(template);
  const headerHeight = 14;
  const contentWidth = Math.max(40, widthMm - template.margin_left_mm - template.margin_right_mm);
  const contentHeight = Math.max(40, heightMm - template.margin_top_mm - template.margin_bottom_mm - headerHeight);
  const cellWidth = (contentWidth - template.gap_x_mm * (template.cols - 1)) / template.cols;
  const cellHeight = (contentHeight - template.gap_y_mm * (template.rows - 1)) / template.rows;
  const pageSize = template.paper_size === 'custom' ? `${widthMm}mm ${heightMm}mm` : `${template.paper_size} ${template.orientation}`;
  const qrColumnWidth = Math.min(cellWidth * 0.44, template.qr_size_mm + 5);
  return {
    kind,
    pageWidthMm: widthMm,
    pageHeightMm: heightMm,
    pageSize,
    cellWidth: Number(cellWidth.toFixed(2)),
    cellHeight: Number(cellHeight.toFixed(2)),
    qrColumnWidth: Number(qrColumnWidth.toFixed(2)),
  };
}

function renderCardsPage(pageTitle: string, cards: PreparedQrCardRecord[], pageIndex: number, totalPages: number, template: QrPrintTemplate) {
  return `
  <section class="print-page cards-page">
    <div class="page-topline">
      <div class="page-title">${escapeHtml(pageTitle)}</div>
      <div class="page-sub">第 ${pageIndex + 1} 页 / 共 ${totalPages} 页 · ${cards.length} 张</div>
    </div>
    <div class="cards-grid">
      ${cards.map((record) => `
        <article class="qr-card">
          <div class="qr-box">${inlineSvgMarkup(record.svg, { role: 'img', 'aria-label': 'QR' })}</div>
          <div class="card-content">
            ${template.show_title ? `<div class="card-title">${escapeHtml(record.title)}</div>` : ''}
            ${template.show_subtitle && record.subtitle ? `<div class="card-subtitle">${escapeHtml(record.subtitle)}</div>` : ''}
            ${template.show_meta && record.meta?.length ? `<div class="meta">${renderCardMeta(record.meta, template.meta_count)}</div>` : ''}
            ${template.show_link ? `<div class="link">${escapeHtml(record.url)}</div>` : ''}
          </div>
        </article>`).join('')}
    </div>
  </section>`;
}

async function renderQrCardsHtml(title: string, records: QrCardRecord[], inputTemplate?: Partial<QrPrintTemplate>) {
  const template = normalizeQrPrintTemplate('cards', inputTemplate);
  const vars = buildLayoutVars('cards', template);
  const cards = await prepareQrCards(records);
  const pages = chunkRecords(cards, Math.max(1, template.cols * template.rows));
  const cardTitleSize = Math.max(3.8, Math.min(6, vars.cellHeight * 0.11));
  const subtitleSize = Math.max(2.5, Math.min(3.2, cardTitleSize * 0.56));
  const metaSize = Math.max(2.3, Math.min(2.9, cardTitleSize * 0.48));
  const linkSize = Math.max(2, Math.min(2.4, cardTitleSize * 0.42));
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
@page{size:${vars.pageSize};margin:${template.margin_top_mm}mm ${template.margin_right_mm}mm ${template.margin_bottom_mm}mm ${template.margin_left_mm}mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{padding:0}
.print-page{width:${vars.pageWidthMm - template.margin_left_mm - template.margin_right_mm}mm;height:${vars.pageHeightMm - template.margin_top_mm - template.margin_bottom_mm}mm;overflow:hidden;page-break-after:always;break-after:page;background:#fff}
.print-page:last-child{page-break-after:auto;break-after:auto}
.page-topline{height:10mm;display:flex;align-items:flex-end;justify-content:space-between;padding:0 1mm 2mm 1mm;border-bottom:0.2mm solid #e5e7eb;margin-bottom:4mm}
.page-title{font-size:5mm;font-weight:800;line-height:1}
.page-sub{font-size:2.7mm;color:#6b7280;line-height:1}
.cards-grid{height:calc(100% - 14mm);display:grid;grid-template-columns:repeat(${template.cols}, minmax(0, 1fr));grid-template-rows:repeat(${template.rows}, minmax(0, 1fr));gap:${template.gap_y_mm}mm ${template.gap_x_mm}mm}
.qr-card{display:grid;grid-template-columns:${vars.qrColumnWidth}mm minmax(0,1fr);gap:3.2mm;border:0.3mm solid #d1d5db;border-radius:2.8mm;padding:3.2mm;background:#fff;overflow:hidden;height:100%;break-inside:avoid;page-break-inside:avoid}
.qr-box{display:flex;align-items:center;justify-content:center;border:0.3mm solid #e5e7eb;border-radius:2.2mm;padding:1.2mm;background:#fff}
.qr-box svg{width:${template.qr_size_mm}mm;height:${template.qr_size_mm}mm;display:block}
.card-content{display:flex;flex-direction:column;min-width:0;height:100%}
.card-title{font-size:${cardTitleSize.toFixed(2)}mm;font-weight:800;line-height:1.18;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-subtitle{margin-top:1.4mm;color:#4b5563;font-size:${subtitleSize.toFixed(2)}mm;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.meta{margin-top:2mm;padding-top:2mm;border-top:0.2mm dashed #d1d5db;display:grid;gap:0.8mm}
.meta-row{display:flex;justify-content:space-between;gap:2mm;font-size:${metaSize.toFixed(2)}mm;line-height:1.25}
.meta-row .k{color:#6b7280;white-space:nowrap}
.meta-row .v{font-weight:700;text-align:right;word-break:break-all}
.link{margin-top:auto;padding-top:2mm;font-size:${linkSize.toFixed(2)}mm;color:#6b7280;word-break:break-all;line-height:1.2;max-height:7mm;overflow:hidden}
@media print{html,body{background:#fff}.print-page{border-radius:0;box-shadow:none}}
</style>
</head>
<body>
${pages.map((pageCards, index) => renderCardsPage(title, pageCards, index, pages.length, template)).join('')}
</body>
</html>`;
}

function renderSheetPage(pageTitle: string, cards: PreparedQrCardRecord[], pageIndex: number, totalPages: number, template: QrPrintTemplate) {
  return `
  <section class="print-page sheet-page">
    <div class="sheet-topline">
      <div class="page-title">${escapeHtml(pageTitle)}</div>
      <div class="page-sub">第 ${pageIndex + 1} 页 / 共 ${totalPages} 页 · ${cards.length} 张</div>
    </div>
    <div class="sheet-grid">
      ${cards.map((record) => `
        <article class="sheet-item">
          <div class="sheet-qr">${inlineSvgMarkup(record.svg, { role: 'img', 'aria-label': 'QR' })}</div>
          <div class="sheet-text">
            ${template.show_title ? `<div class="sheet-title">${escapeHtml(record.title)}</div>` : ''}
            ${template.show_subtitle && record.subtitle ? `<div class="sheet-subtitle">${escapeHtml(record.subtitle)}</div>` : ''}
            ${template.show_meta && record.meta?.length ? `<div class="sheet-meta">${renderCardMeta(record.meta, template.meta_count)}</div>` : ''}
            ${template.show_link ? `<div class="sheet-link">${escapeHtml(record.url)}</div>` : ''}
          </div>
        </article>`).join('')}
    </div>
  </section>`;
}

async function renderQrSheetHtml(title: string, records: QrCardRecord[], inputTemplate?: Partial<QrPrintTemplate>) {
  const template = normalizeQrPrintTemplate('sheet', inputTemplate);
  const vars = buildLayoutVars('sheet', template);
  const cards = await prepareQrCards(records);
  const pages = chunkRecords(cards, Math.max(1, template.cols * template.rows));
  const titleSize = Math.max(3.6, Math.min(5.2, vars.cellHeight * 0.1));
  const subtitleSize = Math.max(2.4, Math.min(3, titleSize * 0.58));
  const metaSize = Math.max(2.2, Math.min(2.8, titleSize * 0.5));
  const linkSize = Math.max(2, Math.min(2.3, titleSize * 0.42));
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
@page{size:${vars.pageSize};margin:${template.margin_top_mm}mm ${template.margin_right_mm}mm ${template.margin_bottom_mm}mm ${template.margin_left_mm}mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{padding:0}
.print-page{width:${vars.pageWidthMm - template.margin_left_mm - template.margin_right_mm}mm;height:${vars.pageHeightMm - template.margin_top_mm - template.margin_bottom_mm}mm;padding:0;overflow:hidden;page-break-after:always;break-after:page;background:#fff}
.print-page:last-child{page-break-after:auto;break-after:auto}
.sheet-topline{height:10mm;display:flex;align-items:flex-end;justify-content:space-between;padding:0 1mm 2mm 1mm;border-bottom:0.2mm solid #e5e7eb;margin-bottom:4mm}
.page-title{font-size:5mm;font-weight:800;line-height:1}
.page-sub{font-size:2.7mm;color:#6b7280;line-height:1}
.sheet-grid{height:calc(100% - 14mm);display:grid;grid-template-columns:repeat(${template.cols}, minmax(0, 1fr));grid-template-rows:repeat(${template.rows}, minmax(0, 1fr));gap:${template.gap_y_mm}mm ${template.gap_x_mm}mm}
.sheet-item{display:grid;grid-template-columns:${vars.qrColumnWidth}mm minmax(0,1fr);gap:3mm;align-items:center;border:0.3mm solid #d1d5db;border-radius:2.6mm;padding:3.2mm;background:#fff;overflow:hidden;height:100%}
.sheet-qr{display:flex;align-items:center;justify-content:center;border:0.3mm solid #e5e7eb;border-radius:2mm;padding:1.1mm;background:#fff}
.sheet-qr svg{width:${template.qr_size_mm}mm;height:${template.qr_size_mm}mm;display:block}
.sheet-text{min-width:0;display:flex;flex-direction:column;gap:1.2mm}
.sheet-title{font-size:${titleSize.toFixed(2)}mm;font-weight:800;line-height:1.15;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sheet-subtitle{font-size:${subtitleSize.toFixed(2)}mm;color:#4b5563;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sheet-meta{margin-top:0.4mm;display:grid;gap:0.7mm}
.sheet-meta .meta-row{display:flex;justify-content:space-between;gap:2mm;font-size:${metaSize.toFixed(2)}mm;line-height:1.24}
.sheet-meta .meta-row .k{color:#6b7280;white-space:nowrap}
.sheet-meta .meta-row .v{font-weight:700;text-align:right;word-break:break-all}
.sheet-link{padding-top:1mm;font-size:${linkSize.toFixed(2)}mm;color:#6b7280;word-break:break-all;line-height:1.2;max-height:7mm;overflow:hidden}
@media print{html,body{background:#fff}.print-page{border-radius:0;box-shadow:none}}
</style>
</head>
<body>
${pages.map((pageCards, index) => renderSheetPage(title, pageCards, index, pages.length, template)).join('')}
</body>
</html>`;
}

async function listPcAssetsForExport(db: D1Database, baseQuery: QueryParts, limit: number, offset = 0) {
  const rows: any[] = [];
  let remaining = Math.max(0, limit);
  let currentOffset = Math.max(0, offset);
  while (remaining > 0) {
    const chunkSize = Math.min(200, remaining);
    const chunk = await listPcAssets(db, { ...baseQuery, page: 1, pageSize: chunkSize, offset: currentOffset, fast: false });
    if (!chunk.length) break;
    rows.push(...chunk);
    currentOffset += chunk.length;
    remaining -= chunk.length;
    if (chunk.length < chunkSize) break;
  }
  return rows;
}

async function runInitMissingQrKeysJob(db: D1Database, config: { assetTable: 'pc_assets' | 'monitor_assets'; notFoundMessage: string; publicPath: '/public/pc-asset' | '/public/monitor-asset'; batchSize: number; maxRounds: number; kindLabel: string }) {
  let totalUpdated = 0;
  let rounds = 0;
  let lastUpdated = 0;
  for (let index = 0; index < config.maxRounds; index += 1) {
    rounds += 1;
    const result = await initMissingAssetQrKeys(db, {
      assetTable: config.assetTable,
      notFoundMessage: config.notFoundMessage,
      publicPath: config.publicPath,
    }, config.batchSize);
    lastUpdated = Number(result.updated || 0);
    totalUpdated += lastUpdated;
    if (lastUpdated <= 0) break;
  }
  return { total_updated: totalUpdated, rounds, batch_size: config.batchSize, exhausted: lastUpdated > 0 };
}



type WorkbookHeader = { key: string; title: string };

type AsyncJobBuiltResult = {
  text?: string | null;
  blobBase64?: string | null;
  stream?: ReadableStream<Uint8Array> | null;
  fileSize?: number | null;
  filename: string;
  contentType: string;
  message: string;
  meta?: Record<string, any> | null;
};

type AsyncJobResultBucket = {
  put: (key: string, value: any, options?: any) => Promise<any>;
  get: (key: string, options?: any) => Promise<any>;
  delete?: (key: string) => Promise<any>;
} | null | undefined;

function toB64FilenameSafe(value: any) {
  return String(value || '').replace(/[\/:*?"<>|]/g, '_').trim() || '盘点结果';
}

function parseStoredDateTime(input: any) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + '+08:00' : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00+08:00' : s;
  const dt = new Date(normalized);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatBeijingDateTimeText(input: any) {
  if (!input) return '';
  const dt = parseStoredDateTime(input);
  if (!dt) return String(input ?? '');
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(dt).replace(/\//g, '-');
}

function buildBatchExportTimestamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}_${hh}${mm}`;
}

function assetStatusText(status: any) {
  switch (String(status || '')) {
    case 'IN_STOCK': return '在库';
    case 'ASSIGNED': return '已领用';
    case 'RECYCLED': return '已回收';
    case 'SCRAPPED': return '已报废';
    default: return String(status || '-');
  }
}

function inventoryStatusText(status: any) {
  switch (String(status || '').toUpperCase()) {
    case 'CHECKED_OK': return '已盘';
    case 'CHECKED_ISSUE': return '异常';
    default: return '未盘';
  }
}

function inventoryIssueTypeText(issueType: any) {
  switch (String(issueType || '').toUpperCase()) {
    case 'NOT_FOUND': return '未找到';
    case 'WRONG_LOCATION': return '位置不符';
    case 'WRONG_QR': return '二维码不符';
    case 'WRONG_STATUS': return '状态不符';
    case 'MISSING': return '缺失';
    case 'OTHER': return '其他';
    default: return String(issueType || '-');
  }
}

function appendWorkbookSheet(wb: XLSX.WorkBook, sheetName: string, rows: any[], headers?: WorkbookHeader[]) {
  const safeName = String(sheetName || 'Sheet').slice(0, 31) || 'Sheet';
  const data = Array.isArray(headers) && headers.length
    ? (rows || []).map((row) => {
        const mapped: Record<string, any> = {};
        headers.forEach((header) => {
          mapped[header.title] = row?.[header.key] ?? '';
        });
        return mapped;
      })
    : (rows || []);
  const ws = Array.isArray(headers) && headers.length
    ? XLSX.utils.json_to_sheet(data, { header: headers.map((header) => header.title) })
    : XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, safeName);
}

async function listPcBatchAssets(db: D1Database, batchId: number, inventoryStatus?: string | null) {
  const rows: any[] = [];
  const pageSize = 500;
  let offset = 0;
  const normalizedStatus = String(inventoryStatus || '').trim().toUpperCase();
  while (true) {
    const binds: any[] = [Number(batchId)];
    let statusSql = '';
    if (normalizedStatus) {
      statusSql = ` AND COALESCE(a.inventory_status, 'UNCHECKED')=?`;
      binds.push(normalizedStatus);
    }
    binds.push(pageSize, offset);
    const result = await db.prepare(
      `SELECT
         a.*,
         s.current_employee_no AS last_employee_no,
         s.current_employee_name AS last_employee_name,
         s.current_department AS last_department,
         s.last_config_date,
         s.last_recycle_date
       FROM pc_assets a
       LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id
      WHERE a.inventory_batch_id=?
        AND COALESCE(a.archived, 0)=0${statusSql}
      ORDER BY a.id ASC
      LIMIT ? OFFSET ?`
    ).bind(...binds).all<any>();
    const chunk = result.results || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function listMonitorBatchAssets(db: D1Database, batchId: number, inventoryStatus?: string | null) {
  const rows: any[] = [];
  const pageSize = 500;
  let offset = 0;
  const normalizedStatus = String(inventoryStatus || '').trim().toUpperCase();
  while (true) {
    const binds: any[] = [Number(batchId)];
    let statusSql = '';
    if (normalizedStatus) {
      statusSql = ` AND COALESCE(a.inventory_status, 'UNCHECKED')=?`;
      binds.push(normalizedStatus);
    }
    binds.push(pageSize, offset);
    const result = await db.prepare(
      `SELECT
         a.*,
         l.name AS location_name,
         p.name AS parent_location_name
       FROM monitor_assets a
       LEFT JOIN pc_locations l ON l.id = a.location_id
       LEFT JOIN pc_locations p ON p.id = l.parent_id
      WHERE a.inventory_batch_id=?
        AND COALESCE(a.archived, 0)=0${statusSql}
      ORDER BY a.id ASC
      LIMIT ? OFFSET ?`
    ).bind(...binds).all<any>();
    const chunk = result.results || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

function mapPcBatchWorkbookRows(rows: any[]) {
  return rows.map((row, index) => ({
    seq: index + 1,
    brand_model: [row.brand, row.model].filter(Boolean).join(' · ') || '-',
    serial_no: row.serial_no || '-',
    status: assetStatusText(row.status),
    inventory_status: inventoryStatusText(row.inventory_status),
    inventory_at: row.inventory_at || '-',
    inventory_issue_type: String(row.inventory_status || '').toUpperCase() === 'CHECKED_ISSUE' ? inventoryIssueTypeText(row.inventory_issue_type) : '-',
    employee_name: row.last_employee_name || '-',
    employee_no: row.last_employee_no || '-',
    department: row.last_department || '-',
    config_date: row.last_config_date || '-',
    recycle_date: row.last_recycle_date || '-',
    remark: row.remark || '-',
  }));
}

function mapMonitorBatchWorkbookRows(rows: any[]) {
  return rows.map((row, index) => ({
    seq: index + 1,
    asset_code: row.asset_code || '-',
    brand_model: [row.brand, row.model].filter(Boolean).join(' · ') || '-',
    sn: row.sn || '-',
    status: assetStatusText(row.status),
    location: [row.parent_location_name, row.location_name].filter(Boolean).join('/') || '-',
    inventory_status: inventoryStatusText(row.inventory_status),
    inventory_at: row.inventory_at || '-',
    inventory_issue_type: String(row.inventory_status || '').toUpperCase() === 'CHECKED_ISSUE' ? inventoryIssueTypeText(row.inventory_issue_type) : '-',
    employee_name: row.employee_name || '-',
    employee_no: row.employee_no || '-',
    department: row.department || '-',
    remark: row.remark || '-',
  }));
}

async function buildInventoryBatchSnapshotWorkbook(db: D1Database, requestJson: any): Promise<AsyncJobBuiltResult> {
  const kind = String(requestJson?.kind || '').trim().toLowerCase() as AssetInventoryKind;
  if (kind !== 'pc' && kind !== 'monitor') throw new Error('盘点快照任务 kind 无效');
  const batchId = Number(requestJson?.batch_id || 0);
  if (!Number.isFinite(batchId) || batchId <= 0) throw new Error('盘点快照任务缺少 batch_id');
  const batch = await db.prepare(`SELECT * FROM asset_inventory_batch WHERE id=? AND kind=? LIMIT 1`).bind(batchId, kind).first<any>();
  if (!batch?.id) throw new Error('盘点批次不存在');
  const checkedRows = kind === 'pc' ? await listPcBatchAssets(db, batchId, 'CHECKED_OK') : await listMonitorBatchAssets(db, batchId, 'CHECKED_OK');
  const uncheckedRows = kind === 'pc' ? await listPcBatchAssets(db, batchId, 'UNCHECKED') : await listMonitorBatchAssets(db, batchId, 'UNCHECKED');
  const issueRows = kind === 'pc' ? await listPcBatchAssets(db, batchId, 'CHECKED_ISSUE') : await listMonitorBatchAssets(db, batchId, 'CHECKED_ISSUE');
  const summaryRows = [
    { 项目: '盘点批次', 内容: batch.name || '-' },
    { 项目: '开始时间', 内容: batch.started_at || '-' },
    { 项目: '结束时间', 内容: batch.closed_at || '-' },
    { 项目: '导出时间', 内容: formatBeijingDateTimeText(new Date().toISOString()) },
    { 项目: '已盘', 内容: checkedRows.length },
    { 项目: '未盘', 内容: uncheckedRows.length },
    { 项目: '异常', 内容: issueRows.length },
    { 项目: '设备总数', 内容: checkedRows.length + uncheckedRows.length + issueRows.length },
  ];
  const headers = kind === 'pc'
    ? [
        { key: 'seq', title: '序号' },
        { key: 'brand_model', title: '电脑' },
        { key: 'serial_no', title: 'SN' },
        { key: 'status', title: '业务状态' },
        { key: 'inventory_status', title: '盘点状态' },
        { key: 'inventory_at', title: '盘点时间' },
        { key: 'inventory_issue_type', title: '异常类型' },
        { key: 'employee_name', title: '当前领用人' },
        { key: 'employee_no', title: '工号' },
        { key: 'department', title: '部门' },
        { key: 'config_date', title: '配置日期' },
        { key: 'recycle_date', title: '回收日期' },
        { key: 'remark', title: '备注' },
      ]
    : [
        { key: 'seq', title: '序号' },
        { key: 'asset_code', title: '资产编号' },
        { key: 'brand_model', title: '显示器' },
        { key: 'sn', title: 'SN' },
        { key: 'status', title: '业务状态' },
        { key: 'location', title: '位置' },
        { key: 'inventory_status', title: '盘点状态' },
        { key: 'inventory_at', title: '盘点时间' },
        { key: 'inventory_issue_type', title: '异常类型' },
        { key: 'employee_name', title: '领用人' },
        { key: 'employee_no', title: '工号' },
        { key: 'department', title: '部门' },
        { key: 'remark', title: '备注' },
      ];
  const mappedCheckedRows = kind === 'pc' ? mapPcBatchWorkbookRows(checkedRows) : mapMonitorBatchWorkbookRows(checkedRows);
  const mappedUncheckedRows = kind === 'pc' ? mapPcBatchWorkbookRows(uncheckedRows) : mapMonitorBatchWorkbookRows(uncheckedRows);
  const mappedIssueRows = kind === 'pc' ? mapPcBatchWorkbookRows(issueRows) : mapMonitorBatchWorkbookRows(issueRows);
  const wb = XLSX.utils.book_new();
  appendWorkbookSheet(wb, '汇总', summaryRows);
  appendWorkbookSheet(wb, '已盘', mappedCheckedRows, headers);
  appendWorkbookSheet(wb, '未盘', mappedUncheckedRows, headers);
  appendWorkbookSheet(wb, '异常', mappedIssueRows, headers);
  const filename = `${toB64FilenameSafe(batch.name || (kind === 'pc' ? '电脑盘点' : '显示器盘点'))}_${buildBatchExportTimestamp()}_盘点结果.xlsx`;
  const blobBase64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  return {
    blobBase64,
    filename,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    message: `盘点结果快照已生成（已盘 ${checkedRows.length} / 未盘 ${uncheckedRows.length} / 异常 ${issueRows.length}）`,
  };
}

function estimateBase64DecodedByteLength(input: any) {
  const base64 = String(input || '');
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

function encodeBytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function gzipTextToBase64(text: string) {
  if (typeof (globalThis as any).CompressionStream === 'undefined') {
    throw new Error('当前环境不支持 gzip 压缩');
  }
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(utf8Encoder.encode(text));
      controller.close();
    },
  }).pipeThrough(new CompressionStream('gzip') as any);
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return encodeBytesToBase64(new Uint8Array(arrayBuffer));
}

function decodeBase64ToBytes(input: any) {
  const base64 = String(input || '');
  if (!base64) return new Uint8Array();
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function buildAsyncJobResultObjectKey(row: any, filename: string) {
  const safeName = String(filename || `job_${Number(row?.id || 0)}.dat`).replace(/[^a-zA-Z0-9._-]+/g, '_');
  const created = String(row?.created_at || '').replace(/[^0-9]/g, '').slice(0, 14) || String(Date.now());
  return `async-jobs/${created}/job_${Number(row?.id || 0)}/${safeName}`;
}

function buildAsyncJobResultPutOptions(contentType: string, filename: string) {
  return {
    httpMetadata: {
      contentType: String(contentType || 'application/octet-stream'),
      contentDisposition: `attachment; filename="${String(filename || 'download.dat').replace(/"/g, '')}"`,
      cacheControl: 'private, no-store',
    },
  };
}

async function readReadableStreamToBytes(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function saveAsyncJobResultFile(bucket: AsyncJobResultBucket, row: any, result: AsyncJobBuiltResult) {
  if (!bucket) return null;
  const filename = String(result.filename || `job_${Number(row?.id || 0)}.dat`);
  const objectKey = buildAsyncJobResultObjectKey(row, filename);
  const contentType = String(result.contentType || 'application/octet-stream');
  const shouldBufferStream = String(row?.job_type || '') === 'BACKUP_EXPORT' && result.stream != null;
  const body = shouldBufferStream
    ? await readReadableStreamToBytes(result.stream as ReadableStream<Uint8Array>)
    : result.stream != null
      ? result.stream
      : result.blobBase64 != null
        ? decodeBase64ToBytes(result.blobBase64)
        : String(result.text ?? '');
  await bucket.put(objectKey, body, buildAsyncJobResultPutOptions(contentType, filename));
  const fileSize = result.fileSize != null
    ? Number(result.fileSize || 0)
    : shouldBufferStream
      ? (body as Uint8Array).byteLength
      : result.blobBase64 != null
        ? estimateBase64DecodedByteLength(result.blobBase64)
        : result.stream != null
          ? null
          : utf8ByteLength(result.text ?? '');
  return { objectKey, fileSize };
}

async function loadAsyncJobStoredObject(bucket: AsyncJobResultBucket, row: any) {
  if (!bucket || !row?.result_object_key) return null;
  return await bucket.get(String(row.result_object_key));
}

export async function buildAsyncJobDownloadResponse(row: any, bucket: AsyncJobResultBucket, options: { inline?: boolean; print?: boolean } = {}) {
  if (String(row?.status) !== 'success') throw Object.assign(new Error('任务尚未完成'), { status: 400 });
  const hasObject = !!row?.result_object_key;
  const hasBlob = !!row?.result_blob_base64;
  const hasText = row?.result_text != null;
  if (!hasObject && !hasBlob && !hasText) {
    if (row?.result_deleted_at) throw Object.assign(new Error('结果文件已过保留期，请重试重新生成'), { status: 410 });
    throw Object.assign(new Error('任务结果不可用'), { status: 400 });
  }
  const filename = String(row?.result_filename || `job_${Number(row?.id || 0)}.txt`);
  const contentType = String(row?.result_content_type || 'text/plain; charset=utf-8');
  const headers: Record<string, string> = {
    'content-type': contentType,
    'content-disposition': `${options.inline ? 'inline' : 'attachment'}; filename="${filename}"`,
    'cache-control': 'no-store',
  };
  if (hasObject) {
    const obj = await loadAsyncJobStoredObject(bucket, row);
    if (!obj?.body) throw Object.assign(new Error('结果文件不存在或已被删除'), { status: 410 });
    return new Response(obj.body, { headers });
  }
  if (hasBlob) {
    return new Response(decodeBase64ToBytes(row.result_blob_base64), { headers });
  }
  let bodyText = String(row?.result_text || '');
  if (options.print && contentType.includes('text/html')) {
    const printScript = `<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),120));</script>`;
    bodyText = /<\/body>/i.test(bodyText) ? bodyText.replace(/<\/body>/i, `${printScript}</body>`) : `${bodyText}${printScript}`;
  }
  return new Response(bodyText, { headers });
}

function getInventoryBatchSnapshotMeta(requestJson: any) {
  if (String(requestJson?.kind || '').trim() && Number(requestJson?.batch_id || 0) > 0) {
    return {
      kind: String(requestJson.kind).trim().toLowerCase() as AssetInventoryKind,
      batchId: Number(requestJson.batch_id),
    };
  }
  return null;
}

async function syncInventoryBatchSnapshotJobState(db: D1Database, jobType: AsyncJobType, requestJson: any, state: { status?: 'queued' | 'running' | 'success' | 'failed' | 'canceled'; errorMessage?: string | null; filename?: string | null; objectKey?: string | null; fileSize?: number | null; exportedAt?: string | null }) {
  if (jobType !== 'ASSET_INVENTORY_BATCH_SNAPSHOT_EXPORT') return;
  const meta = getInventoryBatchSnapshotMeta(requestJson);
  if (!meta?.batchId) return;
  await updateInventoryBatchSnapshotJobState(db, meta.batchId, {
    status: state.status ?? null,
    errorMessage: state.errorMessage ?? null,
    filename: state.filename ?? null,
    objectKey: state.objectKey ?? null,
    fileSize: state.fileSize ?? null,
    exportedAt: state.exportedAt ?? null,
  });
}
async function buildJobResult(db: D1Database, type: AsyncJobType, requestJson: any, bucket?: AsyncJobResultBucket): Promise<AsyncJobBuiltResult> {
  if (type === 'PC_QR_KEY_INIT') {
    await ensurePcQrColumns(db);
    const batchSize = Math.max(20, Math.min(500, Number(requestJson?.batch || requestJson?.batch_size || 200)));
    const maxRounds = Math.max(1, Math.min(400, Number(requestJson?.max_rounds || 200)));
    const result = await runInitMissingQrKeysJob(db, {
      assetTable: 'pc_assets',
      notFoundMessage: '电脑台账不存在或已删除',
      publicPath: '/public/pc-asset',
      batchSize,
      maxRounds,
      kindLabel: '电脑',
    });
    return { text: JSON.stringify(result, null, 2), filename: `pc_qr_key_init_${Date.now()}.json`, contentType: 'application/json; charset=utf-8', message: result.total_updated ? `已补齐 ${result.total_updated} 台电脑的二维码 Key` : '无需补齐电脑二维码 Key' };
  }

  if (type === 'MONITOR_QR_KEY_INIT') {
    await ensureMonitorQrColumns(db);
    const batchSize = Math.max(10, Math.min(300, Number(requestJson?.batch || requestJson?.batch_size || 50)));
    const maxRounds = Math.max(1, Math.min(400, Number(requestJson?.max_rounds || 200)));
    const result = await runInitMissingQrKeysJob(db, {
      assetTable: 'monitor_assets',
      notFoundMessage: '显示器台账不存在或已删除',
      publicPath: '/public/monitor-asset',
      batchSize,
      maxRounds,
      kindLabel: '显示器',
    });
    return { text: JSON.stringify(result, null, 2), filename: `monitor_qr_key_init_${Date.now()}.json`, contentType: 'application/json; charset=utf-8', message: result.total_updated ? `已补齐 ${result.total_updated} 台显示器的二维码 Key` : '无需补齐显示器二维码 Key' };
  }

  if (type === 'PC_QR_CARDS_EXPORT') {
    const ids = normalizeJobAssetIds(requestJson?.ids, 500);
    if (!ids.length) throw new Error('请至少选择一台电脑');
    const origin = String(requestJson?.origin || '');
    const records = await buildPcQrRecords(db, origin, ids);
    const html = await renderQrCardsHtml('电脑二维码卡片', records, requestJson?.print_template);
    return { text: html, filename: `pc_qr_cards_${Date.now()}.html`, contentType: 'text/html; charset=utf-8', message: `已生成 ${records.length} 张电脑二维码卡片` };
  }

  if (type === 'PC_QR_SHEET_EXPORT') {
    const ids = normalizeJobAssetIds(requestJson?.ids, 500);
    if (!ids.length) throw new Error('请至少选择一台电脑');
    const origin = String(requestJson?.origin || '');
    const records = await buildPcQrRecords(db, origin, ids);
    const html = await renderQrSheetHtml('电脑二维码图版', records, requestJson?.print_template);
    return { text: html, filename: `pc_qr_sheet_${Date.now()}.html`, contentType: 'text/html; charset=utf-8', message: `已生成 ${records.length} 台电脑的二维码图版打印页` };
  }

  if (type === 'MONITOR_QR_CARDS_EXPORT') {
    const ids = normalizeJobAssetIds(requestJson?.ids, 500);
    if (!ids.length) throw new Error('请至少选择一台显示器');
    const origin = String(requestJson?.origin || '');
    const records = await buildMonitorQrRecords(db, origin, ids);
    const html = await renderQrCardsHtml('显示器二维码卡片', records, requestJson?.print_template);
    return { text: html, filename: `monitor_qr_cards_${Date.now()}.html`, contentType: 'text/html; charset=utf-8', message: `已生成 ${records.length} 张显示器二维码卡片` };
  }

  if (type === 'MONITOR_QR_SHEET_EXPORT') {
    const ids = normalizeJobAssetIds(requestJson?.ids, 500);
    if (!ids.length) throw new Error('请至少选择一台显示器');
    const origin = String(requestJson?.origin || '');
    const records = await buildMonitorQrRecords(db, origin, ids);
    const html = await renderQrSheetHtml('显示器二维码图版', records, requestJson?.print_template);
    return { text: html, filename: `monitor_qr_sheet_${Date.now()}.html`, contentType: 'text/html; charset=utf-8', message: `已生成 ${records.length} 台显示器的二维码图版打印页` };
  }

  if (type === 'ASSET_INVENTORY_BATCH_SNAPSHOT_EXPORT') {
    return buildInventoryBatchSnapshotWorkbook(db, requestJson);
  }

  if (type === 'BACKUP_EXPORT') {
    const backupOptions = parseBackupOptions(requestJson, {
      actor: String(requestJson?.actor || 'async_job'),
      reason: String(requestJson?.reason || 'async_backup_export'),
    });
    const gzip = requestJson?.gzip === true || requestJson?.gzip === 1 || requestJson?.gzip === '1';
    const table = String(requestJson?.table || '').trim() || null;
    const filename = buildBackupFilename({ table, gzip });
    if (bucket) {
      const payload = await createBackupJsonStream(db, backupOptions);
      if (gzip && typeof (globalThis as any).CompressionStream === 'undefined') {
        throw new Error('当前环境不支持 gzip 压缩');
      }
      return {
        stream: gzip ? payload.stream.pipeThrough(new CompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>) as any : payload.stream,
        filename,
        contentType: gzip ? 'application/gzip' : 'application/json; charset=utf-8',
        message: `备份已生成（${payload.tables.length} 张表）`,
        meta: { table_count: payload.tables.length, stats: payload.stats, version: payload.version, filters: payload.meta?.filters || null },
      };
    }
    const payload = await buildBackupPayload(db, backupOptions);
    const jsonText = JSON.stringify(payload);
    if (gzip) {
      const blobBase64 = await gzipTextToBase64(jsonText);
      return { blobBase64, filename, contentType: 'application/gzip', message: `备份已生成（${Object.keys(payload.tables || {}).length} 张表）` };
    }
    return { text: jsonText, filename, contentType: 'application/json; charset=utf-8', message: `备份已生成（${Object.keys(payload.tables || {}).length} 张表）` };
  }

  if (type === 'DASHBOARD_PRECOMPUTE') {
    const result = await precomputeDashboardSnapshots(db, { days: Number(requestJson?.days || 90), force: requestJson?.force === true || requestJson?.force === 1 || requestJson?.force === '1' });
    return { text: JSON.stringify(result, null, 2), filename: `dashboard_precompute_${Date.now()}.json`, contentType: 'application/json; charset=utf-8', message: `看板快照预计算完成：执行 ${result.runs} 个范围任务` };
  }

  if (type === 'OPS_SCAN_REFRESH') {
    const result = await getAutoRepairScan(db, { forceRefresh: true });
    return { text: JSON.stringify(result, null, 2), filename: `ops_scan_${Date.now()}.json`, contentType: 'application/json; charset=utf-8', message: `深度巡检完成：发现 ${Number(result?.total_problem_count || 0)} 类问题` };
  }

  if (type === 'AUDIT_EXPORT') {
    const url = new URL('https://local/export');
    for (const [k, v] of Object.entries(requestJson || {})) if (v != null) url.searchParams.set(k, String(v));
    const filters = parseAuditListFilters(url);
    const scope = String(requestJson?.scope || 'all');
    const total = await countAuditRows(db, filters);
    const limit = scope === 'current' ? filters.pageSize : Math.min(total, Number(requestJson?.max_rows || 10000));
    const offset = scope === 'current' ? filters.offset : 0;
    const rows = limit > 0 ? await listAuditRows(db, filters, { limit, offset }) : [];
    const lines = [['时间','用户','模块','动作','实体','实体ID','对象名称','摘要'].join(',')];
    for (const row of rows) {
      lines.push([
        csvEscape((row as any).created_at),
        csvEscape((row as any).username),
        csvEscape((row as any).module_code),
        csvEscape((row as any).action),
        csvEscape((row as any).entity),
        csvEscape((row as any).entity_id),
        csvEscape((row as any).target_name || (row as any).target_code || ''),
        csvEscape((row as any).summary_text || ''),
      ].join(','));
    }
    return { text: '﻿' + lines.join('\n'), filename: `audit_export_${Date.now()}.csv`, contentType: 'text/csv; charset=utf-8', message: `已生成 ${rows.length} 条审计导出` };
  }

  if (type === 'AUDIT_ARCHIVE_EXPORT') {
    const archiveBefore = String(requestJson?.archive_before || '').trim();
    const maxRows = Math.max(100, Math.min(50000, Number(requestJson?.max_rows || 5000)));
    if (!archiveBefore) throw new Error('缺少 archive_before，无法生成审计归档文件');
    const { results } = await db.prepare(
      `SELECT id, user_id, username, action, entity, entity_id, payload_json, ip, ua,
              module_code, high_risk, target_name, target_code, summary_text, search_text_norm, created_at
         FROM audit_log
        WHERE created_at < ?
        ORDER BY created_at ASC, id ASC
        LIMIT ?`
    ).bind(archiveBefore, maxRows).all<any>();
    const rows = Array.isArray(results) ? results : [];
    if (!rows.length) throw new Error('当前没有符合归档条件的审计日志');
    const lines = rows.map((row) => JSON.stringify(row));
    const text = lines.join('\n') + '\n';
    const blobBase64 = await gzipTextToBase64(text);
    const safeBefore = archiveBefore.replace(/[^0-9]/g, '').slice(0, 14) || String(Date.now());
    return {
      blobBase64,
      filename: `audit_archive_before_${safeBefore}_${rows.length}.ndjson.gz`,
      contentType: 'application/gzip',
      message: `已归档导出 ${rows.length} 条审计日志`,
      meta: {
        archive_before: archiveBefore,
        delete_after_export: requestJson?.delete_after_export === true || requestJson?.delete_after_export === 1 || requestJson?.delete_after_export === '1',
        row_ids: rows.map((row) => Number(row.id)).filter((value) => Number.isFinite(value) && value > 0),
        exported_rows: rows.length,
      },
    };
  }

  const url = new URL('https://local/export');
  for (const [k, v] of Object.entries(requestJson || {})) if (v != null) url.searchParams.set(k, String(v));
  const query = buildPcAssetQuery(url);
  const scope = String(requestJson?.scope || 'all');
  const total = await countByWhere(db, 'pc_assets a', query);
  const limit = scope === 'current' ? query.pageSize : Math.min(total, Number(requestJson?.max_rows || 10000));
  const offset = scope === 'current' ? query.offset : 0;
  const rows = limit > 0 ? await listPcAssetsForExport(db, query, limit, offset) : [];
  const lines = [['品牌','型号','序列号','出厂时间','状态','领用人','工号','部门','备注'].join(',')];
  for (const row of rows) {
    lines.push([
      csvEscape((row as any).brand), csvEscape((row as any).model), csvEscape((row as any).serial_no), csvEscape((row as any).manufacture_date), csvEscape((row as any).status), csvEscape((row as any).last_employee_name || ''), csvEscape((row as any).last_employee_no || ''), csvEscape((row as any).last_department || ''), csvEscape((row as any).remark || ''),
    ].join(','));
  }
  return { text: '﻿' + lines.join('\n'), filename: `pc_age_warnings_${Date.now()}.csv`, contentType: 'text/csv; charset=utf-8', message: `已生成 ${rows.length} 条报废预警导出` };
}

export async function cleanupExpiredAsyncJobResults(db: D1Database, bucket?: AsyncJobResultBucket) {
  await ensureAsyncJobsTable(db);
  const expired = await db.prepare(
    `SELECT id, result_object_key FROM async_jobs
     WHERE status='success'
       AND COALESCE(result_object_key,'')<>''
       AND retain_until IS NOT NULL
       AND retain_until < ${sqlNowStored()}`
  ).all<any>();
  for (const row of expired.results || []) {
    if (bucket?.delete && row?.result_object_key) {
      try { await bucket.delete(String(row.result_object_key)); } catch {}
    }
  }
  const res = await db.prepare(
    `UPDATE async_jobs
     SET result_text=NULL,
         result_blob_base64=NULL,
         result_object_key=NULL,
         result_file_size=NULL,
         result_deleted_at=COALESCE(result_deleted_at, ${sqlNowStored()}),
         updated_at=${sqlNowStored()},
         message=CASE WHEN COALESCE(message,'')='' THEN '结果文件已过保留期，已清理' ELSE message || '（结果文件已过期清理）' END
     WHERE status='success'
       AND (result_text IS NOT NULL OR result_blob_base64 IS NOT NULL OR COALESCE(result_object_key,'')<>'')
       AND retain_until IS NOT NULL
       AND retain_until < ${sqlNowStored()}`
  ).run();
  return Number((res as any)?.meta?.changes || 0);
}

export async function cleanupAsyncJobHousekeeping(db: D1Database, bucket?: AsyncJobResultBucket) {
  await ensureAsyncJobsTable(db);
  const expiredResults = await cleanupExpiredAsyncJobResults(db, bucket);
  const purgeFinished = await db.prepare(
    `DELETE FROM async_jobs
     WHERE status IN ('success','failed','canceled')
       AND COALESCE(result_text,'')=''
       AND COALESCE(result_blob_base64,'')=''
       AND COALESCE(result_object_key,'')=''
       AND COALESCE(finished_at, canceled_at, updated_at, created_at) < datetime('now','+8 hours','-30 day')`
  ).run();
  const staleQueued = await db.prepare(
    `UPDATE async_jobs
     SET status='canceled',
         canceled_at=${sqlNowStored()},
         updated_at=${sqlNowStored()},
         message=CASE WHEN COALESCE(message,'')='' THEN '任务排队超时，已自动取消' ELSE message || '（排队超时自动取消）' END
     WHERE status='queued'
       AND created_at < datetime('now','+8 hours','-1 day')`
  ).run();
  return {
    expired_results: expiredResults,
    purged_rows: Number((purgeFinished as any)?.meta?.changes || 0),
    auto_canceled: Number((staleQueued as any)?.meta?.changes || 0),
  };
}

export async function createAsyncJob(db: D1Database, input: { job_type: AsyncJobType; created_by?: number | null; created_by_name?: string | null; permission_scope?: string | null; request_json?: any; retain_days?: number | null; max_retries?: number | null }, bucket?: AsyncJobResultBucket) {
  await cleanupAsyncJobHousekeeping(db, bucket);
  const retainDays = Math.max(1, Math.min(30, Number(input.retain_days || 7)));
  const maxRetries = Math.max(0, Math.min(5, Number(input.max_retries ?? 1)));
  const res = await db.prepare(
    `INSERT INTO async_jobs (job_type, status, created_by, created_by_name, permission_scope, request_json, retain_until, max_retries, created_at, updated_at)
     VALUES (?, 'queued', ?, ?, ?, ?, datetime('now','+8 hours', ?), ?, ${sqlNowStored()}, ${sqlNowStored()})`
  ).bind(input.job_type, input.created_by ?? null, input.created_by_name ?? null, input.permission_scope ?? null, JSON.stringify(input.request_json || {}), `+${retainDays} day`, maxRetries).run();
  return Number((res as any)?.meta?.last_row_id || 0);
}

export async function processAsyncJob(db: D1Database, id: number, bucket?: AsyncJobResultBucket) {
  await cleanupAsyncJobHousekeeping(db, bucket);
  const row = await db.prepare(`SELECT * FROM async_jobs WHERE id=?`).bind(id).first<any>();
  if (!row) throw Object.assign(new Error('任务不存在'), { status: 404 });
  if (Number(row.cancel_requested || 0) === 1 || String(row.status) === 'canceled') {
    await db.prepare(`UPDATE async_jobs SET status='canceled', canceled_at=COALESCE(canceled_at, ${sqlNowStored()}), updated_at=${sqlNowStored()} WHERE id=?`).bind(id).run();
    const req = row.request_json ? JSON.parse(String(row.request_json)) : {};
    await syncInventoryBatchSnapshotJobState(db, String(row.job_type || '') as AsyncJobType, req, { status: 'canceled', errorMessage: '任务已取消' });
    return;
  }
  const jobType = String(row.job_type || '') as AsyncJobType;
  const req = row.request_json ? JSON.parse(String(row.request_json)) : {};
  if ((jobType === 'ASSET_INVENTORY_BATCH_SNAPSHOT_EXPORT' || jobType === 'AUDIT_ARCHIVE_EXPORT') && !bucket) throw new Error('未绑定 R2：BACKUP_BUCKET。请先在 Cloudflare 里绑定 R2 Bucket。');
  await db.prepare(`UPDATE async_jobs SET status='running', started_at=${sqlNowStored()}, updated_at=${sqlNowStored()}, error_text=NULL WHERE id=?`).bind(id).run();
  await syncInventoryBatchSnapshotJobState(db, jobType, req, { status: 'running', errorMessage: null });
  try {
    const result = await buildJobResult(db, jobType, req, bucket);
    const latest = await db.prepare(`SELECT cancel_requested FROM async_jobs WHERE id=?`).bind(id).first<any>();
    if (Number(latest?.cancel_requested || 0) === 1) {
      await db.prepare(`UPDATE async_jobs SET status='canceled', canceled_at=${sqlNowStored()}, updated_at=${sqlNowStored()}, message='任务已取消' WHERE id=?`).bind(id).run();
      await syncInventoryBatchSnapshotJobState(db, jobType, req, { status: 'canceled', errorMessage: '任务已取消' });
      return;
    }
    const storedFile = await saveAsyncJobResultFile(bucket, row, result);
    await db.prepare(
      `UPDATE async_jobs SET status='success', result_text=?, result_blob_base64=?, result_object_key=?, result_file_size=?, result_content_type=?, result_filename=?, message=?, finished_at=${sqlNowStored()}, updated_at=${sqlNowStored()} WHERE id=?`
    ).bind(storedFile ? null : (result.text ?? null), storedFile ? null : (result.blobBase64 ?? null), storedFile?.objectKey ?? null, storedFile?.fileSize ?? null, result.contentType, result.filename, result.message, id).run();
    if (jobType === 'AUDIT_ARCHIVE_EXPORT') {
      const archiveBefore = String((result.meta as any)?.archive_before || req?.archive_before || '').trim();
      const rowIds = Array.isArray((result.meta as any)?.row_ids) ? (result.meta as any)?.row_ids : [];
      const shouldDelete = !!((result.meta as any)?.delete_after_export);
      const exportedRows = Number((result.meta as any)?.exported_rows || rowIds.length || 0);
      let deletedRows = 0;
      if (shouldDelete && rowIds.length) deletedRows = await deleteAuditRowsByIds(db, rowIds);
      await recordAuditArchiveRun(db, {
        job_id: id,
        archive_before: archiveBefore || req?.archive_before || '',
        exported_rows: exportedRows,
        deleted_rows: deletedRows,
        result_object_key: storedFile?.objectKey ?? null,
        result_filename: result.filename,
        result_file_size: storedFile?.fileSize ?? null,
        content_type: result.contentType,
        status: 'success',
        message: shouldDelete ? `已归档并删除 ${deletedRows} 条审计日志` : `已归档 ${exportedRows} 条审计日志`,
      });
      await db.prepare(`UPDATE async_jobs SET message=?, updated_at=${sqlNowStored()} WHERE id=?`).bind(shouldDelete ? `已归档 ${exportedRows} 条审计日志，并删除 ${deletedRows} 条原始记录` : `已归档 ${exportedRows} 条审计日志`, id).run();
    }
    await syncInventoryBatchSnapshotJobState(db, jobType, req, { status: 'success', errorMessage: null, filename: result.filename, objectKey: storedFile?.objectKey ?? null, fileSize: storedFile?.fileSize ?? null, exportedAt: formatBeijingDateTimeText(new Date().toISOString()) });
  } catch (error: any) {
    const latest = await db.prepare(`SELECT cancel_requested FROM async_jobs WHERE id=?`).bind(id).first<any>();
    if (Number(latest?.cancel_requested || 0) === 1) {
      await db.prepare(`UPDATE async_jobs SET status='canceled', canceled_at=${sqlNowStored()}, updated_at=${sqlNowStored()}, message='任务已取消' WHERE id=?`).bind(id).run();
      await syncInventoryBatchSnapshotJobState(db, jobType, req, { status: 'canceled', errorMessage: '任务已取消' });
      return;
    }
    const errorText = String(error?.message || error || '任务执行失败');
    await db.prepare(`UPDATE async_jobs SET status='failed', error_text=?, finished_at=${sqlNowStored()}, updated_at=${sqlNowStored()} WHERE id=?`).bind(errorText, id).run();
    await syncInventoryBatchSnapshotJobState(db, jobType, req, { status: 'failed', errorMessage: errorText });
  }
}

export async function processAsyncJobIds(db: D1Database, ids: number[], bucket?: AsyncJobResultBucket) {
  const normalized = Array.from(new Set((Array.isArray(ids) ? ids : []).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)));
  for (const id of normalized) {
    try {
      await processAsyncJob(db, id, bucket);
    } catch {
      // 单个任务失败时由 processAsyncJob 自行落库状态，这里继续处理后续任务
    }
  }
}

function toMs(value: any) {
  if (!value) return 0;
  const ts = Date.parse(String(value));
  return Number.isFinite(ts) ? ts : 0;
}

const utf8Encoder = new TextEncoder();

function utf8ByteLength(value: any) {
  return utf8Encoder.encode(String(value ?? '')).length;
}

function estimateBase64DecodedByteLengthByCharLength(base64Length: any) {
  const length = Math.max(0, Number(base64Length || 0));
  if (!length) return 0;
  return Math.floor((length * 3) / 4);
}

function mapAsyncJobRow(row: any) {
  const createdMs = toMs(row?.created_at);
  const startedMs = toMs(row?.started_at);
  const finishedMs = toMs(row?.finished_at || row?.canceled_at);
  const durationMs = startedMs && finishedMs && finishedMs >= startedMs ? finishedMs - startedMs : 0;
  const resultSize = row?.result_file_size != null
    ? Number(row.result_file_size || 0)
    : Number(row?.result_blob_base64_len || 0) > 0
      ? estimateBase64DecodedByteLengthByCharLength(row.result_blob_base64_len)
      : Number(row?.result_text_len || 0) > 0
        ? Math.max(0, Number(row.result_text_len || 0))
        : row?.result_blob_base64
          ? estimateBase64DecodedByteLength(row.result_blob_base64)
          : row?.result_text == null
            ? 0
            : utf8ByteLength(row.result_text);
  const progress = String(row?.status) === 'success' ? 100
    : String(row?.status) === 'failed' ? 100
    : String(row?.status) === 'canceled' ? 100
    : String(row?.status) === 'running' ? 55
    : 5;
  const expiresInMs = row?.retain_until ? Math.max(0, toMs(row.retain_until) - Date.now()) : 0;
  return {
    ...row,
    duration_ms: durationMs,
    progress_pct: progress,
    result_size: resultSize,
    expires_in_ms: expiresInMs,
    is_expired: !!row?.result_deleted_at || (!!row?.retain_until && expiresInMs <= 0),
    age_ms: createdMs ? Math.max(0, Date.now() - createdMs) : 0,
  };
}

export async function listAsyncJobs(db: D1Database, options: { limit?: number; status?: string | null; job_type?: string | null; created_by?: number | null; days?: number | null; ids?: number[] | null; after_id?: number | null } = {}, bucket?: AsyncJobResultBucket) {
  await ensureAsyncJobsTable(db);
  const limit = Math.max(1, Math.min(200, Number(options.limit || 100)));
  const where: string[] = [];
  const binds: any[] = [];
  if (options.status) { where.push(`status=?`); binds.push(String(options.status)); }
  if (options.job_type) { where.push(`job_type=?`); binds.push(String(options.job_type)); }
  if (options.created_by) { where.push(`created_by=?`); binds.push(Number(options.created_by)); }
  if (options.days) { where.push(`created_at >= datetime('now','+8 hours', ?)`); binds.push(`-${Math.max(1, Math.min(90, Number(options.days || 7)))} day`); }

  const deltaParts: string[] = [];
  const deltaBinds: any[] = [];
  const afterId = Number(options.after_id || 0);
  if (Number.isFinite(afterId) && afterId > 0) {
    deltaParts.push(`id > ?`);
    deltaBinds.push(Math.trunc(afterId));
  }
  const ids = Array.isArray(options.ids)
    ? Array.from(new Set(options.ids.map((value) => Math.trunc(Number(value || 0))).filter((value) => Number.isFinite(value) && value > 0))).slice(0, 200)
    : [];
  if (ids.length) {
    deltaParts.push(`id IN (${ids.map(() => '?').join(',')})`);
    deltaBinds.push(...ids);
  }
  if (deltaParts.length) {
    where.push(`(${deltaParts.join(' OR ')})`);
    binds.push(...deltaBinds);
  }

  const sql = `SELECT id, job_type, status, created_by, created_by_name, permission_scope, message, error_text, result_filename, result_content_type, result_file_size, started_at, finished_at, created_at, updated_at, retry_count, max_retries, cancel_requested, retain_until, result_deleted_at, canceled_at,
    CASE WHEN COALESCE(NULLIF(result_object_key,''), '') <> '' OR result_blob_base64 IS NOT NULL OR result_text IS NOT NULL THEN 1 ELSE 0 END AS result_available,
    LENGTH(result_blob_base64) AS result_blob_base64_len,
    LENGTH(result_text) AS result_text_len
    FROM async_jobs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...binds, limit).all<any>();
  return (results || []).map(mapAsyncJobRow);
}

export async function getAsyncJob(db: D1Database, id: number, bucket?: AsyncJobResultBucket) {
  await ensureAsyncJobsTable(db);
  return await db.prepare(`SELECT * FROM async_jobs WHERE id=?`).bind(id).first<any>();
}

export async function cancelAsyncJob(db: D1Database, id: number, bucket?: AsyncJobResultBucket) {
  await ensureAsyncJobsTable(db);
  const row = await getAsyncJob(db, id, bucket);
  if (!row) throw Object.assign(new Error('任务不存在'), { status: 404 });
  if (String(row.status) === 'success') throw Object.assign(new Error('任务已完成，不能取消'), { status: 409 });
  if (String(row.status) === 'failed') throw Object.assign(new Error('任务已失败，请直接重试'), { status: 409 });
  const res = await db.prepare(
    `UPDATE async_jobs SET cancel_requested=1, status=CASE WHEN status='queued' THEN 'canceled' ELSE status END, canceled_at=CASE WHEN status='queued' THEN ${sqlNowStored()} ELSE canceled_at END, updated_at=${sqlNowStored()}, message=CASE WHEN status='queued' THEN '任务已取消' ELSE '任务取消中' END WHERE id=?`
  ).bind(id).run();
  const req = row.request_json ? JSON.parse(String(row.request_json)) : {};
  if (String(row.status) === 'queued') await syncInventoryBatchSnapshotJobState(db, String(row.job_type || '') as AsyncJobType, req, { status: 'canceled', errorMessage: '任务已取消' });
  return Number((res as any)?.meta?.changes || 0) > 0;
}

export async function retryAsyncJob(db: D1Database, id: number, bucket?: AsyncJobResultBucket) {
  await ensureAsyncJobsTable(db);
  const row = await getAsyncJob(db, id, bucket);
  if (!row) throw Object.assign(new Error('任务不存在'), { status: 404 });
  if (!['failed', 'canceled'].includes(String(row.status))) throw Object.assign(new Error('仅失败或已取消任务可重试'), { status: 409 });
  const retryCount = Number(row.retry_count || 0);
  const maxRetries = Number(row.max_retries || 1);
  if (retryCount >= maxRetries) throw Object.assign(new Error(`已超过最大重试次数（${maxRetries}）`), { status: 409 });
  await db.prepare(
    `UPDATE async_jobs SET status='queued', cancel_requested=0, canceled_at=NULL, error_text=NULL, message='任务已重新排队', started_at=NULL, finished_at=NULL, result_text=NULL, result_blob_base64=NULL, result_object_key=NULL, result_file_size=NULL, result_content_type=NULL, result_filename=NULL, result_deleted_at=NULL, retry_count=COALESCE(retry_count,0)+1, updated_at=${sqlNowStored()} WHERE id=?`
  ).bind(id).run();
  const req = row.request_json ? JSON.parse(String(row.request_json)) : {};
  await syncInventoryBatchSnapshotJobState(db, String(row.job_type || '') as AsyncJobType, req, { status: 'queued', errorMessage: null, filename: null, exportedAt: null });
}

export async function deleteAsyncJob(db: D1Database, id: number, bucket?: AsyncJobResultBucket) {
  await ensureAsyncJobsTable(db);
  const row = await getAsyncJob(db, id, bucket);
  if (!row) throw Object.assign(new Error('任务不存在'), { status: 404 });
  if (['queued', 'running'].includes(String(row.status || ''))) throw Object.assign(new Error('运行中的任务不能直接删除，请先取消'), { status: 409 });
  const objectKey = String(row.result_object_key || '').trim();
  if (objectKey && bucket && typeof bucket.delete === 'function') {
    try { await bucket.delete(objectKey); } catch {}
  }
  await db.prepare(`UPDATE asset_inventory_batch SET snapshot_job_id=NULL WHERE snapshot_job_id=?`).bind(id).run();
  await db.prepare(`DELETE FROM async_jobs WHERE id=?`).bind(id).run();
  return true;
}

export async function deleteAsyncJobs(db: D1Database, ids: number[], bucket?: AsyncJobResultBucket) {
  await ensureAsyncJobsTable(db);
  const normalized = Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((value) => Math.trunc(Number(value || 0)))
    .filter((value) => Number.isFinite(value) && value > 0)));

  const deletedIds: number[] = [];
  const blockedIds: number[] = [];
  const missingIds: number[] = [];
  const failedIds: number[] = [];

  for (const id of normalized) {
    try {
      const row = await getAsyncJob(db, id, bucket);
      if (!row) {
        missingIds.push(id);
        continue;
      }
      if (['queued', 'running'].includes(String(row.status || ''))) {
        blockedIds.push(id);
        continue;
      }
      const objectKey = String(row.result_object_key || '').trim();
      if (objectKey && bucket && typeof bucket.delete === 'function') {
        try { await bucket.delete(objectKey); } catch {}
      }
      await db.prepare(`UPDATE asset_inventory_batch SET snapshot_job_id=NULL WHERE snapshot_job_id=?`).bind(id).run();
      await db.prepare(`DELETE FROM async_jobs WHERE id=?`).bind(id).run();
      deletedIds.push(id);
    } catch {
      failedIds.push(id);
    }
  }

  return {
    requested: normalized.length,
    deleted: deletedIds.length,
    blocked: blockedIds.length,
    missing: missingIds.length,
    failed: failedIds.length,
    deleted_ids: deletedIds,
    blocked_ids: blockedIds,
    missing_ids: missingIds,
    failed_ids: failedIds,
  };
}
