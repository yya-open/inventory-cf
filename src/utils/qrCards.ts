import QRCode from 'qrcode';

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
      dataUrl: await QRCode.toDataURL(record.url, { width: 220, margin: 2, errorCorrectionLevel: 'Q' }),
    }))
  );
}

export async function downloadQrCardsHtml(filename: string, title: string, records: QrCardRecord[]) {
  const cards = await prepareQrCards(records);

  const html = `<!doctype html>
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

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.html') ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
