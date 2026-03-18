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

export async function downloadQrCardsHtml(filename: string, title: string, records: QrCardRecord[]) {
  const cards = await Promise.all(
    records.map(async (record) => ({
      ...record,
      dataUrl: await QRCode.toDataURL(record.url, { width: 220, margin: 2, errorCorrectionLevel: 'Q' }),
    }))
  );

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
