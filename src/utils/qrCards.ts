import JSZip from 'jszip';
import QRCode from 'qrcode';
import {
  createDefaultQrPrintTemplate,
  normalizeQrPrintTemplate,
  resolveQrPaperDimensions,
  type QrPrintTemplate,
  type QrPrintTemplateKind,
} from './qrPrintTemplate';

export type QrCardRecord = {
  title: string;
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  url: string;
};

type QrCardPreparedRecord = QrCardRecord & { dataUrl: string };
type DownloadFile = { name: string; blob: Blob };
type LayoutMetrics = {
  pxPerMm: number;
  pageWidthPx: number;
  pageHeightPx: number;
  marginTopPx: number;
  marginRightPx: number;
  marginBottomPx: number;
  marginLeftPx: number;
  headerHeightPx: number;
  pageInnerWidthPx: number;
  pageInnerHeightPx: number;
  gapXPx: number;
  gapYPx: number;
  cellWidthPx: number;
  cellHeightPx: number;
  qrSizePx: number;
  paddingPx: number;
  radiusPx: number;
  borderPx: number;
};

type TextBlock = {
  lines: string[];
  fontPx: number;
  color: string;
  bold?: boolean;
  lineHeight: number;
};

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

function chunkRecords<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function mmToPx(mm: number, pxPerMm: number) {
  return Math.max(1, Math.round(mm * pxPerMm));
}

function buildMetrics(template: QrPrintTemplate): LayoutMetrics {
  const { widthMm, heightMm } = resolveQrPaperDimensions(template);
  const pxPerMm = template.output_dpi / 25.4;
  const pageWidthPx = mmToPx(widthMm, pxPerMm);
  const pageHeightPx = mmToPx(heightMm, pxPerMm);
  const marginTopPx = mmToPx(template.margin_top_mm, pxPerMm);
  const marginRightPx = mmToPx(template.margin_right_mm, pxPerMm);
  const marginBottomPx = mmToPx(template.margin_bottom_mm, pxPerMm);
  const marginLeftPx = mmToPx(template.margin_left_mm, pxPerMm);
  const headerHeightPx = template.show_page_header ? mmToPx(10, pxPerMm) : 0;
  const pageInnerWidthPx = Math.max(mmToPx(10, pxPerMm), pageWidthPx - marginLeftPx - marginRightPx);
  const pageInnerHeightPx = Math.max(mmToPx(10, pxPerMm), pageHeightPx - marginTopPx - marginBottomPx - headerHeightPx);
  const gapXPx = mmToPx(template.gap_x_mm, pxPerMm);
  const gapYPx = mmToPx(template.gap_y_mm, pxPerMm);
  const cellWidthPx = Math.floor((pageInnerWidthPx - gapXPx * (template.cols - 1)) / template.cols);
  const cellHeightPx = Math.floor((pageInnerHeightPx - gapYPx * (template.rows - 1)) / template.rows);
  return {
    pxPerMm,
    pageWidthPx,
    pageHeightPx,
    marginTopPx,
    marginRightPx,
    marginBottomPx,
    marginLeftPx,
    headerHeightPx,
    pageInnerWidthPx,
    pageInnerHeightPx,
    gapXPx,
    gapYPx,
    cellWidthPx,
    cellHeightPx,
    qrSizePx: mmToPx(template.qr_size_mm, pxPerMm),
    paddingPx: Math.max(6, mmToPx(template.label_preset === 'none' ? 2.6 : 1.2, pxPerMm)),
    radiusPx: Math.max(8, mmToPx(template.label_preset === 'none' ? 2.4 : 1.6, pxPerMm)),
    borderPx: Math.max(1, Math.round(pxPerMm * 0.2)),
  };
}

async function prepareQrCards(records: QrCardRecord[], qrPixelSize: number): Promise<QrCardPreparedRecord[]> {
  const width = Math.max(256, Math.min(1600, Math.round(qrPixelSize * 2.4)));
  return Promise.all(
    records.map(async (record) => ({
      ...record,
      dataUrl: await QRCode.toDataURL(record.url, { width, margin: 1, errorCorrectionLevel: 'Q' }),
    }))
  );
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

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('二维码图片导出失败'));
    }, 'image/png');
  });
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

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, baseFontPx: number, maxLines: number, minFontPx = 10, bold = false) {
  let fontPx = Math.max(minFontPx, baseFontPx);
  while (fontPx > minFontPx) {
    ctx.font = `${bold ? 'bold ' : ''}${fontPx}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { lines, fontPx };
    fontPx -= 1;
  }
  ctx.font = `${bold ? 'bold ' : ''}${minFontPx}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  return { lines: wrapText(ctx, text, maxWidth).slice(0, maxLines), fontPx: minFontPx };
}

function drawTextBlock(ctx: CanvasRenderingContext2D, x: number, y: number, maxWidth: number, block: TextBlock) {
  ctx.fillStyle = block.color;
  ctx.font = `${block.bold ? 'bold ' : ''}${block.fontPx}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  ctx.textBaseline = 'top';
  block.lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * block.lineHeight, maxWidth);
  });
  return y + block.lines.length * block.lineHeight;
}

function buildTextBlocks(
  ctx: CanvasRenderingContext2D,
  card: QrCardPreparedRecord,
  template: QrPrintTemplate,
  kind: QrPrintTemplateKind,
  textWidth: number,
  compact: boolean,
) {
  const blocks: TextBlock[] = [];
  const titleFont = compact ? 18 : 22;
  const subtitleFont = compact ? 13 : 16;
  const metaFont = compact ? 12 : 14;
  const linkFont = compact ? 11 : 12;

  if (template.show_title && card.title) {
    const fitted = fitText(ctx, card.title, textWidth, titleFont, compact ? 2 : 3, 11, true);
    blocks.push({ lines: fitted.lines, fontPx: fitted.fontPx, color: '#111827', bold: true, lineHeight: Math.round(fitted.fontPx * 1.15) });
  }
  if (template.show_subtitle && card.subtitle) {
    const fitted = fitText(ctx, card.subtitle, textWidth, subtitleFont, 2, 10, false);
    blocks.push({ lines: fitted.lines, fontPx: fitted.fontPx, color: '#4b5563', lineHeight: Math.round(fitted.fontPx * 1.2) });
  }
  if (template.show_meta && Array.isArray(card.meta) && card.meta.length && template.meta_count > 0) {
    (card.meta || []).slice(0, template.meta_count).forEach((item) => {
      const fitted = fitText(ctx, `${item.label}：${item.value}`, textWidth, metaFont, 1, 9, false);
      blocks.push({ lines: fitted.lines, fontPx: fitted.fontPx, color: '#374151', lineHeight: Math.round(fitted.fontPx * 1.25) });
    });
  }
  if (template.show_link && card.url) {
    const fitted = fitText(ctx, card.url, textWidth, linkFont, compact ? 1 : 2, 8, false);
    blocks.push({ lines: fitted.lines, fontPx: fitted.fontPx, color: '#6b7280', lineHeight: Math.round(fitted.fontPx * 1.15) });
  }
  if (kind === 'sheet' && template.content_mode === 'qr_only') return [];
  return blocks;
}

function drawHeader(ctx: CanvasRenderingContext2D, title: string, pageIndex: number, totalPages: number, count: number, metrics: LayoutMetrics) {
  if (!metrics.headerHeightPx) return;
  const x = metrics.marginLeftPx;
  const y = metrics.marginTopPx;
  ctx.fillStyle = '#111827';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${Math.max(16, Math.round(metrics.pxPerMm * 4.4))}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  ctx.fillText(title, x + Math.round(metrics.pxPerMm), y + Math.round(metrics.pxPerMm));
  const subText = `第 ${pageIndex + 1} 页 / 共 ${totalPages} 页 · ${count} 张`;
  ctx.fillStyle = '#6b7280';
  ctx.font = `${Math.max(10, Math.round(metrics.pxPerMm * 2.2))}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  const subWidth = ctx.measureText(subText).width;
  ctx.fillText(subText, x + metrics.pageInnerWidthPx - subWidth - Math.round(metrics.pxPerMm), y + Math.round(metrics.pxPerMm * 1.5));
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = Math.max(1, Math.round(metrics.pxPerMm * 0.2));
  ctx.beginPath();
  const lineY = y + metrics.headerHeightPx - Math.round(metrics.pxPerMm * 1.5);
  ctx.moveTo(x + Math.round(metrics.pxPerMm), lineY);
  ctx.lineTo(x + metrics.pageInnerWidthPx - Math.round(metrics.pxPerMm), lineY);
  ctx.stroke();
}

async function drawCardCell(
  ctx: CanvasRenderingContext2D,
  kind: QrPrintTemplateKind,
  template: QrPrintTemplate,
  card: QrCardPreparedRecord,
  cellX: number,
  cellY: number,
  metrics: LayoutMetrics,
) {
  const { cellWidthPx, cellHeightPx, paddingPx, qrSizePx, borderPx, radiusPx } = metrics;
  const compact = template.label_preset !== 'none' || cellWidthPx < cellHeightPx * 1.35;
  const verticalLayout = kind === 'sheet' || compact;
  const cardFill = '#ffffff';
  const stroke = template.label_preset === 'none' ? '#d1d5db' : '#cbd5e1';

  ctx.fillStyle = cardFill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = borderPx;
  roundRect(ctx, cellX, cellY, cellWidthPx, cellHeightPx, radiusPx);
  ctx.fill();
  ctx.stroke();

  const innerX = cellX + paddingPx;
  const innerY = cellY + paddingPx;
  const innerWidth = cellWidthPx - paddingPx * 2;
  const innerHeight = cellHeightPx - paddingPx * 2;
  const qrBoxPadding = Math.max(4, Math.round(metrics.pxPerMm * 0.7));
  const qrBoxRadius = Math.max(6, Math.round(metrics.pxPerMm * 1));
  const qrImage = await loadImage(card.dataUrl);
  const textBlocks = buildTextBlocks(ctx, card, template, kind, verticalLayout ? innerWidth : Math.max(40, innerWidth - qrSizePx - qrBoxPadding * 3), compact);

  if (template.content_mode === 'qr_only') {
    const qrDrawSize = Math.min(qrSizePx, innerWidth, innerHeight);
    const qrDrawX = innerX + Math.floor((innerWidth - qrDrawSize) / 2);
    const qrDrawY = innerY + Math.floor((innerHeight - qrDrawSize) / 2);
    ctx.strokeStyle = '#e5e7eb';
    roundRect(ctx, qrDrawX - qrBoxPadding, qrDrawY - qrBoxPadding, qrDrawSize + qrBoxPadding * 2, qrDrawSize + qrBoxPadding * 2, qrBoxRadius);
    ctx.stroke();
    ctx.drawImage(qrImage, qrDrawX, qrDrawY, qrDrawSize, qrDrawSize);
    return;
  }

  if (verticalLayout) {
    const textHeight = textBlocks.reduce((sum, block) => sum + block.lines.length * block.lineHeight, 0) + Math.max(0, (textBlocks.length - 1) * Math.round(metrics.pxPerMm * 0.6));
    const qrAreaHeight = Math.max(40, innerHeight - textHeight - (textBlocks.length ? Math.round(metrics.pxPerMm * 1.2) : 0));
    const qrDrawSize = Math.min(qrSizePx, innerWidth, qrAreaHeight);
    const qrDrawX = innerX + Math.floor((innerWidth - qrDrawSize) / 2);
    const qrDrawY = innerY + Math.max(0, Math.floor((qrAreaHeight - qrDrawSize) / 2));
    ctx.strokeStyle = '#e5e7eb';
    roundRect(ctx, qrDrawX - qrBoxPadding, qrDrawY - qrBoxPadding, qrDrawSize + qrBoxPadding * 2, qrDrawSize + qrBoxPadding * 2, qrBoxRadius);
    ctx.stroke();
    ctx.drawImage(qrImage, qrDrawX, qrDrawY, qrDrawSize, qrDrawSize);

    let cursorY = qrDrawY + qrDrawSize + Math.round(metrics.pxPerMm * 1.3);
    textBlocks.forEach((block, index) => {
      cursorY = drawTextBlock(ctx, innerX, cursorY, innerWidth, block);
      if (index < textBlocks.length - 1) cursorY += Math.round(metrics.pxPerMm * 0.6);
    });
    return;
  }

  const qrBoxWidth = qrSizePx + qrBoxPadding * 2;
  const qrBoxX = innerX;
  const qrBoxY = innerY + Math.max(0, Math.floor((innerHeight - qrBoxWidth) / 2));
  ctx.strokeStyle = '#e5e7eb';
  roundRect(ctx, qrBoxX, qrBoxY, qrBoxWidth, qrBoxWidth, qrBoxRadius);
  ctx.stroke();
  ctx.drawImage(qrImage, qrBoxX + qrBoxPadding, qrBoxY + qrBoxPadding, qrSizePx, qrSizePx);

  const textX = qrBoxX + qrBoxWidth + Math.round(metrics.pxPerMm * 1.2);
  const textWidth = Math.max(40, innerX + innerWidth - textX);
  let cursorY = innerY;
  textBlocks.forEach((block, index) => {
    cursorY = drawTextBlock(ctx, textX, cursorY, textWidth, block);
    if (index < textBlocks.length - 1) cursorY += Math.round(metrics.pxPerMm * 0.6);
  });
}

async function renderQrPagesAsPng(kind: QrPrintTemplateKind, title: string, records: QrCardRecord[], inputTemplate?: Partial<QrPrintTemplate>) {
  const template = normalizeQrPrintTemplate(kind, inputTemplate || createDefaultQrPrintTemplate(kind));
  const metrics = buildMetrics(template);
  const cards = await prepareQrCards(records, metrics.qrSizePx);
  if (!cards.length) return [] as DownloadFile[];
  const perPage = Math.max(1, template.cols * template.rows);
  const pages = chunkRecords(cards, perPage);
  const output: DownloadFile[] = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageCards = pages[pageIndex];
    const canvas = document.createElement('canvas');
    canvas.width = metrics.pageWidthPx;
    canvas.height = metrics.pageHeightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建绘图上下文');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawHeader(ctx, title, pageIndex, pages.length, pageCards.length, metrics);

    const gridTop = metrics.marginTopPx + metrics.headerHeightPx;
    for (let index = 0; index < pageCards.length; index += 1) {
      const col = index % template.cols;
      const row = Math.floor(index / template.cols);
      const x = metrics.marginLeftPx + col * (metrics.cellWidthPx + metrics.gapXPx);
      const y = gridTop + row * (metrics.cellHeightPx + metrics.gapYPx);
      await drawCardCell(ctx, kind, template, pageCards[index], x, y, metrics);
    }

    output.push({
      name: pages.length > 1 ? `第${pageIndex + 1}页.png` : `${title}.png`,
      blob: await canvasToBlob(canvas),
    });
  }
  return output;
}

async function downloadQrPagesAsPng(kind: QrPrintTemplateKind, filename: string, title: string, records: QrCardRecord[], inputTemplate?: Partial<QrPrintTemplate>) {
  const files = await renderQrPagesAsPng(kind, title, records, inputTemplate);
  if (!files.length) return;
  if (files.length === 1) {
    downloadBlob(`${filename}.png`, files[0].blob);
    return;
  }
  const zip = new JSZip();
  files.forEach((file) => zip.file(file.name, file.blob));
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  downloadBlob(`${filename}.zip`, zipBlob);
}

export async function downloadQrCardsHtml(filename: string, title: string, records: QrCardRecord[], template?: Partial<QrPrintTemplate>) {
  await downloadQrPagesAsPng('cards', filename.replace(/\.html$/i, ''), title, records, template);
}

export async function downloadQrSheetHtml(filename: string, title: string, records: QrCardRecord[], template?: Partial<QrPrintTemplate>) {
  await downloadQrPagesAsPng('sheet', filename.replace(/\.html$/i, ''), title, records, template);
}

export async function downloadQrCardsPng(filename: string, title: string, records: QrCardRecord[], template?: Partial<QrPrintTemplate>) {
  await downloadQrPagesAsPng('cards', filename, title, records, template);
}
