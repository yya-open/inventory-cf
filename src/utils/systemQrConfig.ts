import { getCachedSystemSettings, type SystemSettings } from '../api/systemSettings';
import {
  applyQrLabelPreset,
  applyQrPrinterProfile,
  createDefaultQrPrintTemplate,
  getQrPrinterProfile,
  normalizeQrPrintTemplate,
  type QrPrintContentMode,
  type QrPrintTemplate,
  type QrPrintTemplateKind,
  type QrPrintTemplateScope,
} from './qrPrintTemplate';

function keyFor(scope: QrPrintTemplateScope, kind: QrPrintTemplateKind) {
  if (scope === 'monitor') return kind === 'cards' ? 'qr_default_monitor_cards' : 'qr_default_monitor_sheet';
  return kind === 'cards' ? 'qr_default_pc_cards' : 'qr_default_pc_sheet';
}

export function buildSystemDefaultQrTemplate(kind: QrPrintTemplateKind, scope: QrPrintTemplateScope, settings?: Partial<SystemSettings> | null): QrPrintTemplate {
  const source = { ...getCachedSystemSettings(), ...(settings || {}) } as SystemSettings;
  let template = createDefaultQrPrintTemplate(kind);
  template = applyQrPrinterProfile(kind, source.qr_default_printer_profile, template);
  const baseKey = keyFor(scope, kind);
  const presetKey = (source as any)[`${baseKey}_label_preset`] || 'none';
  const contentMode = (source as any)[`${baseKey}_content_mode`] || template.content_mode;
  if (presetKey && presetKey !== 'none') {
    template = applyQrLabelPreset(kind, presetKey, template);
  }
  template.content_mode = contentMode as QrPrintContentMode;
  if (kind === 'sheet' && template.label_preset !== 'none') template.show_link = false;
  return normalizeQrPrintTemplate(kind, template);
}

export function resolveQrPayload(assetType: 'pc' | 'monitor', id: number | string, key: string, publicPath: string, settings?: Partial<SystemSettings> | null, origin?: string) {
  const source = { ...getCachedSystemSettings(), ...(settings || {}) } as SystemSettings;
  const base = String(source.qr_public_base_url || origin || window.location.origin || '').trim().replace(/\/$/, '');
  const numericId = encodeURIComponent(String(id));
  const encodedKey = encodeURIComponent(String(key || ''));
  if (source.qr_content_strategy === 'short_query') {
    return `${base}${publicPath}?a=${numericId}&k=${encodedKey}`;
  }
  if (source.qr_content_strategy === 'custom_text') {
    const prefix = String(source.qr_custom_prefix || 'ASSET:').trim();
    return `${prefix}${assetType.toUpperCase()}:${id}:${key}`;
  }
  return `${base}${publicPath}?id=${numericId}&key=${encodedKey}`;
}

export function describePrinterProfile(settings?: Partial<SystemSettings> | null) {
  const source = { ...getCachedSystemSettings(), ...(settings || {}) } as SystemSettings;
  return getQrPrinterProfile(source.qr_default_printer_profile);
}
