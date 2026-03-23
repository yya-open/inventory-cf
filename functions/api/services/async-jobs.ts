import { sqlNowStored } from '../_time';
import { ensurePcQrColumns } from '../_pc';
import { ensureMonitorQrColumns } from '../_monitor';
import { getOrCreateAssetQrBulk, initMissingAssetQrKeys } from './asset-qr';
import { countAuditRows, listAuditRows, parseAuditListFilters } from './audit-log';
import { buildPcAssetQuery, countByWhere, listPcAssets, type QueryParts } from './asset-ledger';
import { precomputeDashboardSnapshots } from './dashboard-report';
import { getAutoRepairScan } from './ops-tools';
import QRCode from 'qrcode';

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

async function prepareQrCards(records: QrCardRecord[]) {
  return Promise.all(records.map(async (record) => ({
    ...record,
    dataUrl: await QRCode.toDataURL(record.url, { width: 220, margin: 2, errorCorrectionLevel: 'Q' }),
  })));
}

async function renderQrCardsHtml(title: string, records: QrCardRecord[]) {
  const cards = await prepareQrCards(records);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:24px;background:#f5f7fb;color:#1f2937}
.page-title{font-size:22px;font-weight:800;margin-bottom:8px}
.page-sub{color:#6b7280;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:18px;box-shadow:0 10px 24px rgba(15,23,42,.08);break-inside:avoid}
.qr{display:flex;justify-content:center;padding:8px 0 14px}
.qr img{width:200px;height:200px}
.title{font-size:18px;font-weight:800;line-height:1.35}
.subtitle{margin-top:4px;color:#4b5563;font-size:13px}
.meta{margin-top:12px;border-top:1px dashed #d1d5db;padding-top:10px;display:grid;gap:6px}
.meta-row{display:flex;justify-content:space-between;gap:12px;font-size:12px}
.meta-row .k{color:#6b7280}
.meta-row .v{font-weight:700;text-align:right;word-break:break-all}
.link{margin-top:12px;font-size:11px;color:#6b7280;word-break:break-all}
.tip{margin-top:18px;color:#6b7280;font-size:12px}
@media print{body{background:#fff;padding:0}.card{box-shadow:none;border-color:#d1d5db}}
</style>
</head>
<body>
<div class="page-title">${escapeHtml(title)}</div>
<div class="page-sub">共 ${cards.length} 张二维码卡片，可直接浏览器打印或另存为 PDF。</div>
<div class="grid">
${cards.map((record) => `
  <section class="card">
    <div class="qr"><img src="${record.dataUrl}" alt="QR" /></div>
    <div class="title">${escapeHtml(record.title)}</div>
    ${record.subtitle ? `<div class="subtitle">${escapeHtml(record.subtitle)}</div>` : ''}
    ${record.meta?.length ? `<div class="meta">${record.meta.map((item) => `<div class="meta-row"><span class="k">${escapeHtml(item.label)}</span><span class="v">${escapeHtml(item.value)}</span></div>`).join('')}</div>` : ''}
    <div class="link">${escapeHtml(record.url)}</div>
  </section>`).join('')}
</div>
<div class="tip">建议打印时选择 A4、纵向、边距窄；如在手机端打开，可直接调用系统分享/打印。</div>
</body>
</html>`;
}

function wrapTextSvg(text: any, maxChars: number, maxLines = 2) {
  const chars = Array.from(String(text || '').trim());
  if (!chars.length) return ['-'];
  const lines: string[] = [];
  let current = '';
  for (const char of chars) {
    if ((current + char).length > maxChars && current) {
      lines.push(current);
      current = char;
      if (lines.length >= maxLines) break;
    } else current += char;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length > maxLines) return lines.slice(0, maxLines);
  if (chars.length > lines.join('').length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(1, maxChars - 1))}…`;
  }
  return lines;
}

async function renderQrSheetSvg(title: string, records: QrCardRecord[]) {
  const cards = await prepareQrCards(records);
  if (!cards.length) return '';
  const cols = 2;
  const rowsPerPage = 3;
  const pageSize = cols * rowsPerPage;
  const pageWidth = 1600;
  const pageHeight = 2200;
  const margin = 72;
  const gapX = 40;
  const gapY = 40;
  const cardWidth = Math.floor((pageWidth - margin * 2 - gapX) / cols);
  const cardHeight = Math.floor((pageHeight - margin * 2 - gapY * (rowsPerPage - 1)) / rowsPerPage);
  const totalPages = Math.ceil(cards.length / pageSize);
  const pages: string[] = [];
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const pageCards = cards.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);
    const pageBody: string[] = [];
    for (let index = 0; index < pageCards.length; index += 1) {
      const card = pageCards[index];
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = margin + col * (cardWidth + gapX);
      const y = 130 + row * (cardHeight + gapY);
      const qrSize = 240;
      const qrX = x + 28;
      const qrY = y + 34;
      const textX = qrX + qrSize + 28;
      const textWidth = cardWidth - (textX - x) - 28;
      const titleLines = wrapTextSvg(card.title, 18, 2);
      const subtitleLines = wrapTextSvg(card.subtitle || '', 28, 2);
      const meta = (card.meta || []).slice(0, 5);
      const linkLines = wrapTextSvg(card.url, 58, 2);
      pageBody.append(`
      <g>
        <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="28" ry="28" fill="#ffffff" stroke="#e5e7eb" stroke-width="2" />
        <image href="${card.dataUrl}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" preserveAspectRatio="xMidYMid meet" />
        ${titleLines.map((line, lineIndex) => `<text x="${textX}" y="${y + 76 + lineIndex * 38}" font-size="30" font-weight="700" fill="#111827">${escapeXml(line)}</text>`).join('')}
        ${subtitleLines.filter(Boolean).map((line, lineIndex) => `<text x="${textX}" y="${y + 152 + lineIndex * 28}" font-size="20" fill="#4b5563">${escapeXml(line)}</text>`).join('')}
        ${meta.map((item, metaIndex) => {
          const currentY = y + 292 + metaIndex * 30;
          return `<text x="${qrX}" y="${currentY}" font-size="18" fill="#6b7280">${escapeXml(`${item.label}：`)}</text><text x="${qrX + 86}" y="${currentY}" font-size="18" fill="#111827">${escapeXml(String(item.value || '-'))}</text>`;
        }).join('')}
        ${linkLines.map((line, lineIndex) => `<text x="${qrX}" y="${y + cardHeight - 34 + lineIndex * 18}" font-size="14" fill="#9ca3af">${escapeXml(line)}</text>`).join('')}
      </g>`);
    }
    pages.push(`
<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">
  <rect width="100%" height="100%" fill="#f5f7fb" />
  <text x="${margin}" y="54" font-size="40" font-weight="700" fill="#111827">${escapeXml(title)}</text>
  <text x="${margin}" y="92" font-size="24" fill="#6b7280">第 ${pageIndex + 1} 页 · 共 ${cards.length} 张</text>
  ${pageBody.join('')}
</svg>`);
  }
  return pages.join('\n');
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
    const html = await renderQrCardsHtml('电脑二维码卡片', records);
    return { text: html, filename: `pc_qr_cards_${Date.now()}.html`, contentType: 'text/html; charset=utf-8', message: `已生成 ${records.length} 张电脑二维码卡片` };
  }

  if (type === 'PC_QR_SHEET_EXPORT') {
    const ids = normalizeJobAssetIds(requestJson?.ids, 500);
    if (!ids.length) throw new Error('请至少选择一台电脑');
    const origin = String(requestJson?.origin || '');
    const records = await buildPcQrRecords(db, origin, ids);
    const svg = await renderQrSheetSvg('电脑二维码图版', records);
    return { text: svg, filename: `pc_qr_sheet_${Date.now()}.svg`, contentType: 'image/svg+xml; charset=utf-8', message: `已生成 ${records.length} 台电脑的二维码图版（SVG）` };
  }

  if (type === 'MONITOR_QR_CARDS_EXPORT') {
    const ids = normalizeJobAssetIds(requestJson?.ids, 500);
    if (!ids.length) throw new Error('请至少选择一台显示器');
    const origin = String(requestJson?.origin || '');
    const records = await buildMonitorQrRecords(db, origin, ids);
    const html = await renderQrCardsHtml('显示器二维码卡片', records);
    return { text: html, filename: `monitor_qr_cards_${Date.now()}.html`, contentType: 'text/html; charset=utf-8', message: `已生成 ${records.length} 张显示器二维码卡片` };
  }

  if (type === 'MONITOR_QR_SHEET_EXPORT') {
    const ids = normalizeJobAssetIds(requestJson?.ids, 500);
    if (!ids.length) throw new Error('请至少选择一台显示器');
    const origin = String(requestJson?.origin || '');
    const records = await buildMonitorQrRecords(db, origin, ids);
    const svg = await renderQrSheetSvg('显示器二维码图版', records);
    return { text: svg, filename: `monitor_qr_sheet_${Date.now()}.svg`, contentType: 'image/svg+xml; charset=utf-8', message: `已生成 ${records.length} 台显示器的二维码图版（SVG）` };
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
