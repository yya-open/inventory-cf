import { sqlNowStored } from '../_time';
import { ensurePcQrColumns } from '../_pc';
import { ensureMonitorQrColumns } from '../_monitor';
import { getOrCreateAssetQrBulk, initMissingAssetQrKeys } from './asset-qr';
import { countAuditRows, listAuditRows, parseAuditListFilters } from './audit-log';
import { buildPcAssetQuery, countByWhere, listPcAssets, type QueryParts } from './asset-ledger';
import { precomputeDashboardSnapshots } from './dashboard-report';
import { getAutoRepairScan } from './ops-tools';
import QRCode from 'qrcode';
import { normalizeQrPrintTemplate, resolveQrPaperDimensions, type QrPrintTemplate, type QrPrintTemplateKind } from './qr-print-template';

export type AsyncJobType = 'AUDIT_EXPORT' | 'PC_AGE_WARNING_EXPORT' | 'DASHBOARD_PRECOMPUTE' | 'OPS_SCAN_REFRESH' | 'PC_QR_KEY_INIT' | 'MONITOR_QR_KEY_INIT' | 'PC_QR_CARDS_EXPORT' | 'PC_QR_SHEET_EXPORT' | 'MONITOR_QR_CARDS_EXPORT' | 'MONITOR_QR_SHEET_EXPORT';
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

type QrCardRecord = {
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  url: string;
};

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

async function listPcAssetsByIds(db: D1Database, ids: number[]) {
  if (!ids.length) return [] as any[];
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.prepare(`SELECT a.*, s.current_employee_no AS last_employee_no, s.current_employee_name AS last_employee_name, s.current_department AS last_department FROM pc_assets a LEFT JOIN pc_asset_latest_state s ON s.asset_id=a.id WHERE a.id IN (${placeholders}) ORDER BY a.id ASC`).bind(...ids).all<any>();
  return result.results || [];
}

async function listMonitorAssetsByIds(db: D1Database, ids: number[]) {
  if (!ids.length) return [] as any[];
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.prepare(`SELECT a.*, l.name AS location_name, p.name AS parent_location_name FROM monitor_assets a LEFT JOIN pc_locations l ON l.id=a.location_id LEFT JOIN pc_locations p ON p.id=l.parent_id WHERE a.id IN (${placeholders}) ORDER BY a.id ASC`).bind(...ids).all<any>();
  return result.results || [];
}

async function buildPcQrRecords(db: D1Database, origin: string, ids: number[]) {
  await ensurePcQrColumns(db);
  const rows = await listPcAssetsByIds(db, ids);
  const links = await getOrCreateAssetQrBulk(db, { assetTable: 'pc_assets', notFoundMessage: '电脑台账不存在或已删除', publicPath: '/public/pc-asset' }, ids, origin);
  const linkMap = new Map<number, string>(links.map((item) => [Number(item.id), String(item.url || '')] as [number, string]));
  return rows.map((row: any) => ({
    title: [row.brand, row.model].filter(Boolean).join(' · ') || `电脑 #${row.id}`,
    subtitle: `SN：${row.serial_no || '-'} · 状态：${row.status || '-'}`,
    meta: [
      { label: '领用人', value: row.last_employee_name || '-' },
      { label: '工号', value: row.last_employee_no || '-' },
      { label: '部门', value: row.last_department || '-' },
      { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
    ],
    url: linkMap.get(Number(row.id)) || '',
  })).filter((item) => item.url);
}

async function buildMonitorQrRecords(db: D1Database, origin: string, ids: number[]) {
  await ensureMonitorQrColumns(db);
  const rows = await listMonitorAssetsByIds(db, ids);
  const links = await getOrCreateAssetQrBulk(db, { assetTable: 'monitor_assets', notFoundMessage: '显示器台账不存在或已删除', publicPath: '/public/monitor-asset' }, ids, origin);
  const linkMap = new Map<number, string>(links.map((item) => [Number(item.id), String(item.url || '')] as [number, string]));
  return rows.map((row: any) => ({
    title: row.asset_code || `显示器 #${row.id}`,
    subtitle: [row.brand, row.model].filter(Boolean).join(' · ') || `SN：${row.sn || '-'}`,
    meta: [
      { label: '状态', value: row.status || '-' },
      { label: '位置', value: [row.parent_location_name, row.location_name].filter(Boolean).join('/') || '-' },
      { label: '领用人', value: row.employee_name || '-' },
      { label: '归档', value: Number(row.archived || 0) === 1 ? '已归档' : '在用' },
    ],
    url: linkMap.get(Number(row.id)) || '',
  })).filter((item) => item.url);
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

async function buildJobResult(db: D1Database, type: AsyncJobType, requestJson: any) {
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

export async function cleanupExpiredAsyncJobResults(db: D1Database) {
  await ensureAsyncJobsTable(db);
  const res = await db.prepare(
    `UPDATE async_jobs
     SET result_text=NULL,
         result_deleted_at=COALESCE(result_deleted_at, ${sqlNowStored()}),
         updated_at=${sqlNowStored()},
         message=CASE WHEN COALESCE(message,'')='' THEN '结果文件已过保留期，已清理' ELSE message || '（结果文件已过期清理）' END
     WHERE status='success'
       AND result_text IS NOT NULL
       AND retain_until IS NOT NULL
       AND retain_until < ${sqlNowStored()}`
  ).run();
  return Number((res as any)?.meta?.changes || 0);
}

export async function cleanupAsyncJobHousekeeping(db: D1Database) {
  await ensureAsyncJobsTable(db);
  const expiredResults = await cleanupExpiredAsyncJobResults(db);
  const purgeFinished = await db.prepare(
    `DELETE FROM async_jobs
     WHERE status IN ('success','failed','canceled')
       AND COALESCE(result_text,'')=''
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

export async function createAsyncJob(db: D1Database, input: { job_type: AsyncJobType; created_by?: number | null; created_by_name?: string | null; permission_scope?: string | null; request_json?: any; retain_days?: number | null; max_retries?: number | null }) {
  await cleanupAsyncJobHousekeeping(db);
  const retainDays = Math.max(1, Math.min(30, Number(input.retain_days || 7)));
  const maxRetries = Math.max(0, Math.min(5, Number(input.max_retries ?? 1)));
  const res = await db.prepare(
    `INSERT INTO async_jobs (job_type, status, created_by, created_by_name, permission_scope, request_json, retain_until, max_retries, created_at, updated_at)
     VALUES (?, 'queued', ?, ?, ?, ?, datetime('now','+8 hours', ?), ?, ${sqlNowStored()}, ${sqlNowStored()})`
  ).bind(input.job_type, input.created_by ?? null, input.created_by_name ?? null, input.permission_scope ?? null, JSON.stringify(input.request_json || {}), `+${retainDays} day`, maxRetries).run();
  return Number((res as any)?.meta?.last_row_id || 0);
}

export async function processAsyncJob(db: D1Database, id: number) {
  await cleanupAsyncJobHousekeeping(db);
  const row = await db.prepare(`SELECT * FROM async_jobs WHERE id=?`).bind(id).first<any>();
  if (!row) throw Object.assign(new Error('任务不存在'), { status: 404 });
  if (Number(row.cancel_requested || 0) === 1 || String(row.status) === 'canceled') {
    await db.prepare(`UPDATE async_jobs SET status='canceled', canceled_at=COALESCE(canceled_at, ${sqlNowStored()}), updated_at=${sqlNowStored()} WHERE id=?`).bind(id).run();
    return;
  }
  const jobType = String(row.job_type || '') as AsyncJobType;
  const req = row.request_json ? JSON.parse(String(row.request_json)) : {};
  await db.prepare(`UPDATE async_jobs SET status='running', started_at=${sqlNowStored()}, updated_at=${sqlNowStored()}, error_text=NULL WHERE id=?`).bind(id).run();
  try {
    const result = await buildJobResult(db, jobType, req);
    const latest = await db.prepare(`SELECT cancel_requested FROM async_jobs WHERE id=?`).bind(id).first<any>();
    if (Number(latest?.cancel_requested || 0) === 1) {
      await db.prepare(`UPDATE async_jobs SET status='canceled', canceled_at=${sqlNowStored()}, updated_at=${sqlNowStored()}, message='任务已取消' WHERE id=?`).bind(id).run();
      return;
    }
    await db.prepare(
      `UPDATE async_jobs SET status='success', result_text=?, result_content_type=?, result_filename=?, message=?, finished_at=${sqlNowStored()}, updated_at=${sqlNowStored()} WHERE id=?`
    ).bind(result.text, result.contentType, result.filename, result.message, id).run();
  } catch (error: any) {
    const latest = await db.prepare(`SELECT cancel_requested FROM async_jobs WHERE id=?`).bind(id).first<any>();
    if (Number(latest?.cancel_requested || 0) === 1) {
      await db.prepare(`UPDATE async_jobs SET status='canceled', canceled_at=${sqlNowStored()}, updated_at=${sqlNowStored()}, message='任务已取消' WHERE id=?`).bind(id).run();
      return;
    }
    await db.prepare(`UPDATE async_jobs SET status='failed', error_text=?, finished_at=${sqlNowStored()}, updated_at=${sqlNowStored()} WHERE id=?`).bind(String(error?.message || error || '任务执行失败'), id).run();
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

function mapAsyncJobRow(row: any) {
  const createdMs = toMs(row?.created_at);
  const startedMs = toMs(row?.started_at);
  const finishedMs = toMs(row?.finished_at || row?.canceled_at);
  const durationMs = startedMs && finishedMs && finishedMs >= startedMs ? finishedMs - startedMs : 0;
  const resultSize = row?.result_text == null ? 0 : utf8ByteLength(row.result_text);
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

export async function listAsyncJobs(db: D1Database, options: { limit?: number; status?: string | null; job_type?: string | null; created_by?: number | null; days?: number | null } = {}) {
  await cleanupAsyncJobHousekeeping(db);
  const limit = Math.max(1, Math.min(200, Number(options.limit || 100)));
  const where: string[] = [];
  const binds: any[] = [];
  if (options.status) { where.push(`status=?`); binds.push(String(options.status)); }
  if (options.job_type) { where.push(`job_type=?`); binds.push(String(options.job_type)); }
  if (options.created_by) { where.push(`created_by=?`); binds.push(Number(options.created_by)); }
  if (options.days) { where.push(`created_at >= datetime('now','+8 hours', ?)`); binds.push(`-${Math.max(1, Math.min(90, Number(options.days || 7)))} day`); }
  const sql = `SELECT id, job_type, status, created_by, created_by_name, permission_scope, message, error_text, result_filename, result_text, started_at, finished_at, created_at, updated_at, retry_count, max_retries, cancel_requested, retain_until, result_deleted_at, canceled_at FROM async_jobs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...binds, limit).all<any>();
  return (results || []).map(mapAsyncJobRow);
}

export async function getAsyncJob(db: D1Database, id: number) {
  await cleanupAsyncJobHousekeeping(db);
  await ensureAsyncJobsTable(db);
  return await db.prepare(`SELECT * FROM async_jobs WHERE id=?`).bind(id).first<any>();
}

export async function cancelAsyncJob(db: D1Database, id: number) {
  await ensureAsyncJobsTable(db);
  const row = await getAsyncJob(db, id);
  if (!row) throw Object.assign(new Error('任务不存在'), { status: 404 });
  if (String(row.status) === 'success') throw Object.assign(new Error('任务已完成，不能取消'), { status: 409 });
  if (String(row.status) === 'failed') throw Object.assign(new Error('任务已失败，请直接重试'), { status: 409 });
  const res = await db.prepare(
    `UPDATE async_jobs SET cancel_requested=1, status=CASE WHEN status='queued' THEN 'canceled' ELSE status END, canceled_at=CASE WHEN status='queued' THEN ${sqlNowStored()} ELSE canceled_at END, updated_at=${sqlNowStored()}, message=CASE WHEN status='queued' THEN '任务已取消' ELSE '任务取消中' END WHERE id=?`
  ).bind(id).run();
  return Number((res as any)?.meta?.changes || 0) > 0;
}

export async function retryAsyncJob(db: D1Database, id: number) {
  await ensureAsyncJobsTable(db);
  const row = await getAsyncJob(db, id);
  if (!row) throw Object.assign(new Error('任务不存在'), { status: 404 });
  if (!['failed', 'canceled'].includes(String(row.status))) throw Object.assign(new Error('仅失败或已取消任务可重试'), { status: 409 });
  const retryCount = Number(row.retry_count || 0);
  const maxRetries = Number(row.max_retries || 1);
  if (retryCount >= maxRetries) throw Object.assign(new Error(`已超过最大重试次数（${maxRetries}）`), { status: 409 });
  await db.prepare(
    `UPDATE async_jobs SET status='queued', cancel_requested=0, canceled_at=NULL, error_text=NULL, message='任务已重新排队', started_at=NULL, finished_at=NULL, result_text=NULL, result_content_type=NULL, result_filename=NULL, result_deleted_at=NULL, retry_count=COALESCE(retry_count,0)+1, updated_at=${sqlNowStored()} WHERE id=?`
  ).bind(id).run();
}
