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
            ${template.show_title ? `<div class="card-title">${escapeHtml(record.title)}</div>` : ''}
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
            ${template.show_title ? `<div class="sheet-title">${escapeHtml(record.title)}</div>` : ''}
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

export async function downloadQrCardsHtml(filename: string, title: string, records: QrCardRecord[], template?: Partial<QrPrintTemplate>) {
  const cards = await prepareQrCards(records);
  const html = renderPrintHtml('cards', title, cards, template);
  downloadBlob(filename.endsWith('.html') ? filename : `${filename}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
}

export async function downloadQrSheetHtml(filename: string, title: string, records: QrCardRecord[], template?: Partial<QrPrintTemplate>) {
  const cards = await prepareQrCards(records);
  const html = renderPrintHtml('sheet', title, cards, template);
  downloadBlob(filename.endsWith('.html') ? filename : `${filename}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
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

export async function downloadQrCardsPng(filename: string, title: string, records: QrCardRecord[]) {
  const cards = await prepareQrCards(records);
  if (!cards.length) return;

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

  for (let pageIndex = 0; pageIndex * pageSize < cards.length; pageIndex += 1) {
    const pageCards = cards.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);
    const canvas = document.createElement('canvas');
    canvas.width = pageWidth;
    canvas.height = pageHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('生成二维码图版失败');

    ctx.fillStyle = '#f5f7fb';
    ctx.fillRect(0, 0, pageWidth, pageHeight);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 40px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    ctx.fillText(title, margin, 54);
    ctx.font = '24px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`第 ${pageIndex + 1} 页 · 共 ${cards.length} 张`, margin, 92);

    for (let index = 0; index < pageCards.length; index += 1) {
      const card = pageCards[index];
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = margin + col * (cardWidth + gapX);
      const y = 130 + row * (cardHeight + gapY);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 2;
      const radius = 28;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + cardWidth, y, x + cardWidth, y + cardHeight, radius);
      ctx.arcTo(x + cardWidth, y + cardHeight, x, y + cardHeight, radius);
      ctx.arcTo(x, y + cardHeight, x, y, radius);
      ctx.arcTo(x, y, x + cardWidth, y, radius);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const qrImage = await loadImage(card.dataUrl);
      const qrSize = 240;
      const qrX = x + 28;
      const qrY = y + 34;
      ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

      const textX = qrX + qrSize + 28;
      const textWidth = cardWidth - (textX - x) - 28;
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 30px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
      wrapText(ctx, card.title, textWidth).slice(0, 2).forEach((line, lineIndex) => {
        ctx.fillText(line, textX, y + 76 + lineIndex * 38);
      });

      if (card.subtitle) {
        ctx.font = '20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
        ctx.fillStyle = '#4b5563';
        wrapText(ctx, card.subtitle, textWidth).slice(0, 2).forEach((line, lineIndex) => {
          ctx.fillText(line, textX, y + 152 + lineIndex * 28);
        });
      }

      const metaStartY = y + 292;
      ctx.font = '18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
      (card.meta || []).slice(0, 5).forEach((item, metaIndex) => {
        const currentY = metaStartY + metaIndex * 30;
        ctx.fillStyle = '#6b7280';
        ctx.fillText(`${item.label}：`, qrX, currentY);
        ctx.fillStyle = '#111827';
        const labelWidth = ctx.measureText(`${item.label}：`).width;
        const valueLines = wrapText(ctx, item.value, cardWidth - 56 - labelWidth).slice(0, 1);
        ctx.fillText(valueLines[0] || '-', qrX + labelWidth, currentY);
      });

      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
      const linkLines = wrapText(ctx, card.url, cardWidth - 56).slice(0, 2);
      linkLines.forEach((line, lineIndex) => {
        ctx.fillText(line, qrX, y + cardHeight - 34 + lineIndex * 18);
      });
    }

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${filename}_第${pageIndex + 1}页.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
