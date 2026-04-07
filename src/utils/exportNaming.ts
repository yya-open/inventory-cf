import { getCachedSystemSettings } from '../api/systemSettings';
import type { QrPrintTemplate, QrPrintTemplateKind } from './qrPrintTemplate';

function stamp() {
  const now = new Date();
  const pad = (v: number) => String(v).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return { date, time };
}

function safePart(value: string) {
  return String(value || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'file';
}

function templateName(template?: Partial<QrPrintTemplate>) {
  const preset = String(template?.label_preset || '').trim();
  if (preset && preset !== 'none') return preset;
  const mode = String(template?.content_mode || '').trim();
  return mode || 'default';
}

export function buildQrExportFilename(options: {
  scope: 'pc' | 'monitor';
  kind: QrPrintTemplateKind;
  count: number;
  template?: Partial<QrPrintTemplate>;
  singleLabel?: string;
}) {
  const settings = getCachedSystemSettings();
  const { date, time } = stamp();
  const scopeLabel = options.scope === 'pc' ? '电脑' : '显示器';
  const kindLabel = options.kind === 'cards' ? '标签' : '二维码';
  if (settings.export_qr_file_name_mode === 'simple') {
    return safePart(options.singleLabel || `${scopeLabel}${kindLabel}_${options.count}条`);
  }
  if (settings.export_qr_file_name_mode === 'date') {
    return safePart(`${scopeLabel}${kindLabel}_${date}_${time}_${options.count}条`);
  }
  return safePart(`${scopeLabel}_${kindLabel}_${templateName(options.template)}_${options.count}条_${date}_${time}`);
}

export function buildQrZipEntryName(baseName: string, pageIndex: number, pageRecords: Array<{ title?: string; subtitle?: string }>) {
  const settings = getCachedSystemSettings();
  if (settings.export_qr_zip_entry_name_mode === 'asset' && pageRecords.length === 1) {
    const label = safePart(pageRecords[0]?.title || pageRecords[0]?.subtitle || `page_${pageIndex + 1}`);
    return `${safePart(baseName)}_${label}.png`;
  }
  return `${safePart(baseName)}_第${pageIndex + 1}页.png`;
}
