import QRCode from 'qrcode';
import { createDefaultQrPrintTemplate, normalizeQrPrintTemplate, resolveQrPaperDimensions, type QrPrintTemplate, type QrPrintTemplateKind } from './qrPrintTemplate';

export type QrCardRecord = {
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  url: string;
};

function escapeHtml(value: string) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type QrCardPreparedRecord = QrCardRecord & { dataUrl: string };

async function prepareQrCards(records: QrCardRecord[]): Promise<QrCardPreparedRecord[]> {
  return Promise.all(
    records.map(async (record) => ({
      ...record,
      dataUrl: await QRCode.toDataURL(record.url, { width: 240, margin: 1, errorCorrectionLevel: 'Q' }),
    }))
  );
}

function chunkRecords<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
    pageWidthMm: widthMm,
    pageHeightMm: heightMm,
    pageSize,
    cellWidth: Number(cellWidth.toFixed(2)),
    cellHeight: Number(cellHeight.toFixed(2)),
    qrColumnWidth: Number(qrColumnWidth.toFixed(2)),
    kind,
  };
}

function renderCardMeta(meta?: Array<{ label: string; value: string }>, limit = 4) {
  return (meta || []).slice(0, limit).map((item) => `
      <div class="meta-row"><span class="k">${escapeHtml(item.label)}</span><span class="v">${escapeHtml(item.value)}</span></div>`).join('');
}

function renderCardsPage(pageTitle: string, cards: QrCardPreparedRecord[], pageIndex: number, totalPages: number, template: QrPrintTemplate, vars: ReturnType<typeof buildLayoutVars>) {
  return `
  <section class="print-page cards-page">
    <div class="page-topline">
      <div class="page-title">${escapeHtml(pageTitle)}</div>
      <div class="page-sub">第 ${pageIndex + 1} 页 / 共 ${totalPages} 页 · ${cards.length} 张</div>
    </div>
    <div class="cards-grid">
      ${cards.map((record) => `
        <article class="qr-card">
          <div class="qr-box"><img src="${record.dataUrl}" alt="QR" /></div>
          <div class="card-content">
            ${template.show_title && record.title ? `<div class="card-title">${escapeHtml(record.title)}</div>` : ''}
            ${template.show_subtitle && record.subtitle ? `<div class="card-subtitle">${escapeHtml(record.subtitle)}</div>` : ''}
            ${template.show_meta && record.meta?.length ? `<div class="meta">${renderCardMeta(record.meta, template.meta_count)}</div>` : ''}
            ${template.show_link ? `<div class="link">${escapeHtml(record.url)}</div>` : ''}
          </div>
        </article>`).join('')}
    </div>
  </section>`;
}

function renderSheetPage(pageTitle: string, cards: QrCardPreparedRecord[], pageIndex: number, totalPages: number, template: QrPrintTemplate) {
  return `
  <section class="print-page sheet-page">
    <div class="page-topline">
      <div class="page-title">${escapeHtml(pageTitle)}</div>
      <div class="page-sub">第 ${pageIndex + 1} 页 / 共 ${totalPages} 页 · ${cards.length} 张</div>
    </div>
    <div class="sheet-grid">
      ${cards.map((record) => `
        <article class="sheet-item">
          <div class="sheet-qr"><img src="${record.dataUrl}" alt="QR" /></div>
          <div class="sheet-text">
            ${template.show_title && record.title ? `<div class="sheet-title">${escapeHtml(record.title)}</div>` : ''}
            ${template.show_subtitle && record.subtitle ? `<div class="sheet-subtitle">${escapeHtml(record.subtitle)}</div>` : ''}
            ${template.show_meta && record.meta?.length ? `<div class="sheet-meta">${renderCardMeta(record.meta, template.meta_count)}</div>` : ''}
            ${template.show_link ? `<div class="sheet-link">${escapeHtml(record.url)}</div>` : ''}
          </div>
        </article>`).join('')}
    </div>
  </section>`;
}

function renderPrintHtml(kind: QrPrintTemplateKind, title: string, cards: QrCardPreparedRecord[], inputTemplate?: Partial<QrPrintTemplate>) {
  const template = normalizeQrPrintTemplate(kind, inputTemplate || createDefaultQrPrintTemplate(kind));
  const vars = buildLayoutVars(kind, template);
  const perPage = Math.max(1, template.cols * template.rows);
  const pages = chunkRecords(cards, perPage);
  const pageHtml = pages.map((pageCards, index) => kind === 'cards'
    ? renderCardsPage(title, pageCards, index, pages.length, template, vars)
    : renderSheetPage(title, pageCards, index, pages.length, template)
  ).join('');
  const cardTitleSize = kind === 'cards' ? Math.max(3.8, Math.min(6, vars.cellHeight * 0.11)) : Math.max(3.6, Math.min(5.2, vars.cellHeight * 0.1));
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
.cards-grid,.sheet-grid{height:calc(100% - 14mm);display:grid;grid-template-columns:repeat(${template.cols}, minmax(0, 1fr));grid-template-rows:repeat(${template.rows}, minmax(0, 1fr));gap:${template.gap_y_mm}mm ${template.gap_x_mm}mm}
.qr-card,.sheet-item{display:grid;grid-template-columns:${vars.qrColumnWidth}mm minmax(0,1fr);gap:3.2mm;border:0.3mm solid #d1d5db;border-radius:2.8mm;padding:3.2mm;background:#fff;overflow:hidden;height:100%;break-inside:avoid;page-break-inside:avoid}
.qr-box,.sheet-qr{display:flex;align-items:center;justify-content:center;border:0.3mm solid #e5e7eb;border-radius:2.2mm;padding:1.2mm;background:#fff}
.qr-box img,.sheet-qr img{width:${template.qr_size_mm}mm;height:${template.qr_size_mm}mm;display:block}
.card-content,.sheet-text{display:flex;flex-direction:column;min-width:0;height:100%}
.card-title,.sheet-title{font-size:${cardTitleSize.toFixed(2)}mm;font-weight:800;line-height:1.18;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-subtitle,.sheet-subtitle{margin-top:1.4mm;color:#4b5563;font-size:${subtitleSize.toFixed(2)}mm;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.meta,.sheet-meta{margin-top:2mm;padding-top:2mm;border-top:0.2mm dashed #d1d5db;display:grid;gap:0.8mm}
.meta-row{display:flex;justify-content:space-between;gap:2mm;font-size:${metaSize.toFixed(2)}mm;line-height:1.25}
.meta-row .k{color:#6b7280;white-space:nowrap}
.meta-row .v{font-weight:700;text-align:right;word-break:break-all}
.link,.sheet-link{margin-top:auto;padding-top:2mm;font-size:${linkSize.toFixed(2)}mm;color:#6b7280;word-break:break-all;line-height:1.2;max-height:7mm;overflow:hidden}
@media print{html,body{background:#fff}.print-page{border-radius:0;box-shadow:none}}
</style>
</head>
<body>
${pageHtml}
</body>
</html>`;
}

const PX_PER_MM = 12;

function mmToPx(mm: number) {
  return Math.max(1, Math.round(mm * PX_PER_MM));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function downloadQrPagesAsPng(kind: QrPrintTemplateKind, filename: string, title: string, records: QrCardRecord[], inputTemplate?: Partial<QrPrintTemplate>) {
  const cards = await prepareQrCards(records);
  if (!cards.length) return;
  const template = normalizeQrPrintTemplate(kind, inputTemplate || createDefaultQrPrintTemplate(kind));
  const vars = buildLayoutVars(kind, template);
  const perPage = Math.max(1, template.cols * template.rows);
  const pages = chunkRecords(cards, perPage);
  const pageWidthPx = mmToPx(vars.pageWidthMm);
  const pageHeightPx = mmToPx(vars.pageHeightMm);
  const marginLeftPx = mmToPx(template.margin_left_mm);
  const marginRightPx = mmToPx(template.margin_right_mm);
  const marginTopPx = mmToPx(template.margin_top_mm);
  const marginBottomPx = mmToPx(template.margin_bottom_mm);
  const headerHeightPx = mmToPx(14);
  const pageInnerWidthPx = Math.max(200, pageWidthPx - marginLeftPx - marginRightPx);
  const pageInnerHeightPx = Math.max(200, pageHeightPx - marginTopPx - marginBottomPx);
  const gridTopPx = marginTopPx + headerHeightPx;
  const gapXPx = mmToPx(template.gap_x_mm);
  const gapYPx = mmToPx(template.gap_y_mm);
  const cellWidthPx = Math.max(80, Math.round(mmToPx(vars.cellWidth)));
  const cellHeightPx = Math.max(80, Math.round(mmToPx(vars.cellHeight)));
  const qrSizePx = mmToPx(template.qr_size_mm);
  const cardRadiusPx = mmToPx(2.8);
  const paddingPx = mmToPx(3.2);
  const qrPaddingPx = mmToPx(1.2);
  const borderPx = Math.max(1, Math.round(PX_PER_MM * 0.3));
  const qrColumnWidthPx = Math.max(qrSizePx + qrPaddingPx * 2, Math.round(mmToPx(vars.qrColumnWidth)));

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageCards = pages[pageIndex];
    const canvas = document.createElement('canvas');
    canvas.width = pageWidthPx;
    canvas.height = pageHeightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('生成二维码图片失败');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageWidthPx, pageHeightPx);

    ctx.fillStyle = '#111827';
    ctx.font = `bold ${mmToPx(5)}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(title, marginLeftPx + mmToPx(1), marginTopPx + mmToPx(1));
    ctx.fillStyle = '#6b7280';
    ctx.font = `${mmToPx(2.7)}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
    const subText = `第 ${pageIndex + 1} 页 / 共 ${pages.length} 页 · ${pageCards.length} 张`;
    const subWidth = ctx.measureText(subText).width;
    ctx.fillText(subText, marginLeftPx + pageInnerWidthPx - subWidth - mmToPx(1), marginTopPx + mmToPx(2));
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginLeftPx + mmToPx(1), marginTopPx + headerHeightPx - mmToPx(2));
    ctx.lineTo(marginLeftPx + pageInnerWidthPx - mmToPx(1), marginTopPx + headerHeightPx - mmToPx(2));
    ctx.stroke();

    for (let index = 0; index < pageCards.length; index += 1) {
      const card = pageCards[index];
      const col = index % template.cols;
      const row = Math.floor(index / template.cols);
      const x = marginLeftPx + col * (cellWidthPx + gapXPx);
      const y = gridTopPx + row * (cellHeightPx + gapYPx);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = borderPx;
      roundRect(ctx, x, y, cellWidthPx, cellHeightPx, cardRadiusPx);
      ctx.fill();
      ctx.stroke();

      const qrBoxX = x + paddingPx;
      const qrBoxY = y + paddingPx;
      const qrBoxSize = qrSizePx + qrPaddingPx * 2;
      ctx.strokeStyle = '#e5e7eb';
      roundRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, mmToPx(2.2));
      ctx.stroke();
      const qrImage = await loadImage(card.dataUrl);
      ctx.drawImage(qrImage, qrBoxX + qrPaddingPx, qrBoxY + qrPaddingPx, qrSizePx, qrSizePx);

      const textX = x + qrColumnWidthPx + paddingPx + mmToPx(0.8);
      const textWidth = Math.max(mmToPx(12), x + cellWidthPx - textX - paddingPx);
      let cursorY = y + paddingPx;

      const titleFontPx = Math.max(mmToPx(kind === 'cards' ? 4.2 : 4), 28);
      const subtitleFontPx = Math.max(mmToPx(2.8), 18);
      const metaFontPx = Math.max(mmToPx(2.4), 16);
      const linkFontPx = Math.max(mmToPx(2.1), 14);

      if (template.show_title && card.title) {
        ctx.fillStyle = '#111827';
        ctx.font = `bold ${titleFontPx}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
        wrapText(ctx, card.title, textWidth).slice(0, 2).forEach((line) => {
          ctx.fillText(line, textX, cursorY);
          cursorY += Math.round(titleFontPx * 1.2);
        });
      }

      if (template.show_subtitle && card.subtitle) {
        cursorY += mmToPx(0.6);
        ctx.fillStyle = '#4b5563';
        ctx.font = `${subtitleFontPx}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
        wrapText(ctx, card.subtitle, textWidth).slice(0, 2).forEach((line) => {
          ctx.fillText(line, textX, cursorY);
          cursorY += Math.round(subtitleFontPx * 1.25);
        });
      }

      if (template.show_meta && Array.isArray(card.meta) && card.meta.length) {
        cursorY += mmToPx(0.9);
        ctx.strokeStyle = '#d1d5db';
        ctx.beginPath();
        ctx.moveTo(textX, cursorY);
        ctx.lineTo(x + cellWidthPx - paddingPx, cursorY);
        ctx.stroke();
        cursorY += mmToPx(1);
        ctx.font = `${metaFontPx}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
        (card.meta || []).slice(0, template.meta_count).forEach((item) => {
          if (cursorY > y + cellHeightPx - paddingPx - Math.round(linkFontPx * 2.5)) return;
          ctx.fillStyle = '#6b7280';
          const label = `${item.label}：`;
          ctx.fillText(label, textX, cursorY);
          const labelWidth = ctx.measureText(label).width;
          ctx.fillStyle = '#111827';
          const value = wrapText(ctx, item.value, textWidth - labelWidth).slice(0, 1)[0] || '-';
          ctx.fillText(value, textX + labelWidth, cursorY);
          cursorY += Math.round(metaFontPx * 1.4);
        });
      }

      if (template.show_link && card.url) {
        ctx.fillStyle = '#6b7280';
        ctx.font = `${linkFontPx}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
        const linkY = y + cellHeightPx - paddingPx - Math.round(linkFontPx * 1.3);
        wrapText(ctx, card.url, textWidth).slice(0, 2).forEach((line, lineIndex) => {
          ctx.fillText(line, textX, linkY + lineIndex * Math.round(linkFontPx * 1.15));
        });
      }
    }

    const pageNo = pages.length > 1 ? `_第${pageIndex + 1}页` : '';
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${filename}${pageNo}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export async function downloadQrCardsHtml(filename: string, title: string, records: QrCardRecord[], template?: Partial<QrPrintTemplate>) {
  await downloadQrPagesAsPng('cards', filename.replace(/\.html$/i, ''), title, records, template);
}

export async function downloadQrSheetHtml(filename: string, title: string, records: QrCardRecord[], template?: Partial<QrPrintTemplate>) {
  await downloadQrPagesAsPng('sheet', filename.replace(/\.html$/i, ''), title, records, template);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('二维码图片加载失败'));
    image.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const value = String(text || '').trim();
  if (!value) return ['-'];
  const chars = Array.from(value);
  const lines: string[] = [];
  let current = '';
  chars.forEach((char) => {
    const next = current + char;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

export async function downloadQrCardsPng(filename: string, title: string, records: QrCardRecord[], template?: Partial<QrPrintTemplate>) {
  await downloadQrPagesAsPng('cards', filename, title, records, template);
}
