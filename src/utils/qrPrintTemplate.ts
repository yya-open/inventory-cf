import { readJsonStorage, writeJsonStorage } from './storage';

export type QrPrintTemplateKind = 'cards' | 'sheet';
export type QrPrintTemplateScope = 'generic' | 'pc' | 'monitor';
export type QrPaperSize = 'A4' | 'A5' | 'custom';
export type QrOrientation = 'portrait' | 'landscape';
export type QrPrintContentMode = 'detail' | 'qr_only' | 'model_sn' | 'model_asset';
export type QrPrintDpi = 203 | 300;
export type QrLabelPresetKey = 'none' | '40x30' | '50x30' | '60x40' | '70x50';
export type QrPrinterProfileKey = 'generic_300' | 'brother_300' | 'deli_203' | 'gprinter_203';

export type QrPrintTemplate = {
  kind: QrPrintTemplateKind;
  paper_size: QrPaperSize;
  orientation: QrOrientation;
  custom_width_mm: number;
  custom_height_mm: number;
  margin_top_mm: number;
  margin_right_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  cols: number;
  rows: number;
  gap_x_mm: number;
  gap_y_mm: number;
  qr_size_mm: number;
  content_mode: QrPrintContentMode;
  show_title: boolean;
  show_subtitle: boolean;
  show_meta: boolean;
  show_link: boolean;
  show_page_header: boolean;
  meta_count: number;
  output_dpi: QrPrintDpi;
  label_preset: QrLabelPresetKey;
  printer_profile: QrPrinterProfileKey;
  qr_margin_modules: number;
  safe_padding_mm: number;
};

type SavedPreset = {
  id: string;
  name: string;
  template: QrPrintTemplate;
  created_at: string;
  updated_at: string;
};

type ScopedKindMap<T> = Record<QrPrintTemplateScope, Record<QrPrintTemplateKind, T>>;


export type QrPrintTemplateExportFile = {
  version: 1;
  exported_at: string;
  scope: QrPrintTemplateScope;
  kind: QrPrintTemplateKind;
  mode: 'template' | 'bundle';
  template?: QrPrintTemplate;
  default_template?: QrPrintTemplate;
  presets?: Array<{ name: string; template: QrPrintTemplate }>;
};

type StoreState = {
  presets: ScopedKindMap<SavedPreset[]>;
  defaults: ScopedKindMap<QrPrintTemplate>;
  last_used: Partial<Record<QrPrintTemplateScope, Partial<Record<QrPrintTemplateKind, QrPrintTemplate>>>>;
};

export type QrLabelPreset = {
  key: Exclude<QrLabelPresetKey, 'none'>;
  name: string;
  widthMm: number;
  heightMm: number;
  recommendedDpi: QrPrintDpi;
  recommendedQrMm: number;
  description: string;
};


export type QrPrinterProfile = {
  key: QrPrinterProfileKey;
  name: string;
  dpi: QrPrintDpi;
  marginModules: number;
  safePaddingMm: number;
  description: string;
};

const STORAGE_KEY = 'inventory:qr-print-templates:v5';
const LEGACY_STORAGE_KEY = 'inventory:qr-print-templates:v4';


const PRINTER_PROFILES: QrPrinterProfile[] = [
  { key: 'generic_300', name: '通用高精度 / 300 DPI', dpi: 300, marginModules: 2, safePaddingMm: 1.2, description: '适合大多数 300 DPI 标签打印机，二维码留白更稳。' },
  { key: 'brother_300', name: '兄弟标签机 / 300 DPI', dpi: 300, marginModules: 2, safePaddingMm: 1.4, description: '适合兄弟常见机型，边距略放宽，减少切边风险。' },
  { key: 'deli_203', name: '得力标签机 / 203 DPI', dpi: 203, marginModules: 3, safePaddingMm: 1.6, description: '203 DPI 机型建议更大的二维码留白和安全边距。' },
  { key: 'gprinter_203', name: '佳博 / 热敏 203 DPI', dpi: 203, marginModules: 3, safePaddingMm: 1.8, description: '适合常见热敏 203 DPI，提升条码切边与糊边容错。' },
];

const LABEL_PRESETS: QrLabelPreset[] = [
  { key: '40x30', name: '40 × 30 mm', widthMm: 40, heightMm: 30, recommendedDpi: 300, recommendedQrMm: 18, description: '小号标签，适合仅二维码或短文本' },
  { key: '50x30', name: '50 × 30 mm', widthMm: 50, heightMm: 30, recommendedDpi: 300, recommendedQrMm: 20, description: '常用横向标签，适合二维码+型号' },
  { key: '60x40', name: '60 × 40 mm', widthMm: 60, heightMm: 40, recommendedDpi: 300, recommendedQrMm: 24, description: '通用推荐，二维码与两行文字更平衡' },
  { key: '70x50', name: '70 × 50 mm', widthMm: 70, heightMm: 50, recommendedDpi: 300, recommendedQrMm: 28, description: '大标签，适合明细版和更长字段' },
];

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeLabelPresetKey(value: unknown): QrLabelPresetKey {
  if (value === '40x30' || value === '50x30' || value === '60x40' || value === '70x50') return value;
  return 'none';
}

function normalizeDpi(value: unknown): QrPrintDpi {
  return Number(value) === 203 ? 203 : 300;
}

function normalizePrinterProfileKey(value: unknown): QrPrinterProfileKey {
  return PRINTER_PROFILES.some((item) => item.key === value) ? value as QrPrinterProfileKey : 'generic_300';
}


function normalizeScope(value: unknown): QrPrintTemplateScope {
  return value === 'pc' || value === 'monitor' ? value : 'generic';
}

function createEmptyScopedKindMap<T>(factory: (kind: QrPrintTemplateKind, scope: QrPrintTemplateScope) => T): ScopedKindMap<T> {
  return {
    generic: { cards: factory('cards', 'generic'), sheet: factory('sheet', 'generic') },
    pc: { cards: factory('cards', 'pc'), sheet: factory('sheet', 'pc') },
    monitor: { cards: factory('cards', 'monitor'), sheet: factory('sheet', 'monitor') },
  };
}

function createFallbackStore(): StoreState {
  return {
    presets: createEmptyScopedKindMap(() => []),
    defaults: createEmptyScopedKindMap((kind) => createDefaultQrPrintTemplate(kind)),
    last_used: {},
  };
}

export function listQrLabelPresets() {
  return LABEL_PRESETS.slice();
}

export function listQrPrinterProfiles() {
  return PRINTER_PROFILES.slice();
}

export function getQrPrinterProfile(key: QrPrinterProfileKey | string | null | undefined) {
  return PRINTER_PROFILES.find((item) => item.key === key) || PRINTER_PROFILES[0];
}

export function getQrLabelPreset(key: QrLabelPresetKey | string | null | undefined) {
  return LABEL_PRESETS.find((item) => item.key === key) || null;
}

function buildStandardTemplate(kind: QrPrintTemplateKind): QrPrintTemplate {
  if (kind === 'sheet') {
    return {
      kind,
      paper_size: 'A4',
      orientation: 'landscape',
      custom_width_mm: 297,
      custom_height_mm: 210,
      margin_top_mm: 6,
      margin_right_mm: 6,
      margin_bottom_mm: 6,
      margin_left_mm: 6,
      cols: 2,
      rows: 3,
      gap_x_mm: 3.6,
      gap_y_mm: 3.6,
      qr_size_mm: 25,
      content_mode: 'detail',
      show_title: true,
      show_subtitle: true,
      show_meta: true,
      show_link: false,
      show_page_header: true,
      meta_count: 3,
      output_dpi: 300,
      label_preset: 'none',
      printer_profile: 'generic_300',
      qr_margin_modules: 2,
      safe_padding_mm: 1.2,
    };
  }
  return {
    kind,
    paper_size: 'A4',
    orientation: 'landscape',
    custom_width_mm: 297,
    custom_height_mm: 210,
    margin_top_mm: 6,
    margin_right_mm: 6,
    margin_bottom_mm: 6,
    margin_left_mm: 6,
    cols: 2,
    rows: 2,
    gap_x_mm: 4,
    gap_y_mm: 4,
    qr_size_mm: 31,
    content_mode: 'detail',
    show_title: true,
    show_subtitle: true,
    show_meta: true,
    show_link: true,
    show_page_header: true,
    meta_count: 4,
    output_dpi: 300,
    label_preset: 'none',
    printer_profile: 'generic_300',
    qr_margin_modules: 2,
    safe_padding_mm: 1.2,
  };
}

export function createLabelPrinterTemplate(kind: QrPrintTemplateKind, presetKey: Exclude<QrLabelPresetKey, 'none'> = '60x40'): QrPrintTemplate {
  const preset = getQrLabelPreset(presetKey) || LABEL_PRESETS[2];
  const profile = getQrPrinterProfile(preset.recommendedDpi === 203 ? 'gprinter_203' : 'generic_300');
  const isSmall = preset.widthMm <= 50 || preset.heightMm <= 30;
  return {
    kind,
    paper_size: 'custom',
    orientation: 'landscape',
    custom_width_mm: preset.widthMm,
    custom_height_mm: preset.heightMm,
    margin_top_mm: profile.safePaddingMm,
    margin_right_mm: profile.safePaddingMm,
    margin_bottom_mm: profile.safePaddingMm,
    margin_left_mm: profile.safePaddingMm,
    cols: 1,
    rows: 1,
    gap_x_mm: 0,
    gap_y_mm: 0,
    qr_size_mm: preset.recommendedQrMm,
    content_mode: kind === 'sheet' ? 'qr_only' : 'model_sn',
    show_title: kind === 'cards',
    show_subtitle: kind === 'cards',
    show_meta: !isSmall,
    show_link: false,
    show_page_header: false,
    meta_count: isSmall ? 0 : 2,
    output_dpi: profile.dpi,
    label_preset: preset.key,
    printer_profile: profile.key,
    qr_margin_modules: profile.marginModules,
    safe_padding_mm: profile.safePaddingMm,
  };
}

export function createDefaultQrPrintTemplate(kind: QrPrintTemplateKind): QrPrintTemplate {
  return buildStandardTemplate(kind);
}

export function applyQrLabelPreset(kind: QrPrintTemplateKind, presetKey: Exclude<QrLabelPresetKey, 'none'>, base?: Partial<QrPrintTemplate> | null): QrPrintTemplate {
  const template = { ...createLabelPrinterTemplate(kind, presetKey), ...(base || {}) };
  template.kind = kind;
  template.paper_size = 'custom';
  template.orientation = 'landscape';
  const preset = getQrLabelPreset(presetKey) || LABEL_PRESETS[2];
  template.custom_width_mm = preset.widthMm;
  template.custom_height_mm = preset.heightMm;
  template.cols = 1;
  template.rows = 1;
  template.gap_x_mm = 0;
  template.gap_y_mm = 0;
  template.show_page_header = false;
  template.show_link = false;
  template.label_preset = preset.key;
  template.output_dpi = normalizeDpi(template.output_dpi || preset.recommendedDpi);
  return normalizeQrPrintTemplate(kind, template);
}

export function applyQrPrinterProfile(kind: QrPrintTemplateKind, profileKey: QrPrinterProfileKey, base?: Partial<QrPrintTemplate> | null): QrPrintTemplate {
  const profile = getQrPrinterProfile(profileKey);
  const template = normalizeQrPrintTemplate(kind, { ...(base || {}), printer_profile: profile.key, output_dpi: profile.dpi, qr_margin_modules: profile.marginModules, safe_padding_mm: profile.safePaddingMm });
  const padding = Math.max(profile.safePaddingMm, template.label_preset === 'none' ? 1.2 : profile.safePaddingMm);
  template.output_dpi = profile.dpi;
  template.printer_profile = profile.key;
  template.qr_margin_modules = profile.marginModules;
  template.safe_padding_mm = padding;
  const printerProfile = getQrPrinterProfile(template.printer_profile);
  template.output_dpi = printerProfile.dpi;
  template.qr_margin_modules = Math.max(1, template.qr_margin_modules || printerProfile.marginModules);
  template.safe_padding_mm = Math.max(0.8, template.safe_padding_mm || printerProfile.safePaddingMm);
  if (template.label_preset !== 'none') {
    template.margin_top_mm = Math.max(template.margin_top_mm, padding);
    template.margin_right_mm = Math.max(template.margin_right_mm, padding);
    template.margin_bottom_mm = Math.max(template.margin_bottom_mm, padding);
    template.margin_left_mm = Math.max(template.margin_left_mm, padding);
  }
  return template;
}

export function normalizeQrPrintTemplate(kind: QrPrintTemplateKind, input: Partial<QrPrintTemplate> | null | undefined): QrPrintTemplate {
  const presetKey = normalizeLabelPresetKey(input?.label_preset);
  const fallback = presetKey !== 'none' ? createLabelPrinterTemplate(kind, presetKey) : createDefaultQrPrintTemplate(kind);
  const paperSize = input?.paper_size === 'A5' || input?.paper_size === 'custom' ? input.paper_size : fallback.paper_size;
  const orientation = input?.orientation === 'portrait' ? 'portrait' : fallback.orientation;
  const contentMode = input?.content_mode === 'qr_only' || input?.content_mode === 'model_sn' || input?.content_mode === 'model_asset' ? input.content_mode : fallback.content_mode;
  const template: QrPrintTemplate = {
    kind,
    paper_size: paperSize,
    orientation,
    custom_width_mm: clamp(Number(input?.custom_width_mm ?? fallback.custom_width_mm), 20, 500),
    custom_height_mm: clamp(Number(input?.custom_height_mm ?? fallback.custom_height_mm), 20, 500),
    margin_top_mm: clamp(Number(input?.margin_top_mm ?? fallback.margin_top_mm), 0, 40),
    margin_right_mm: clamp(Number(input?.margin_right_mm ?? fallback.margin_right_mm), 0, 40),
    margin_bottom_mm: clamp(Number(input?.margin_bottom_mm ?? fallback.margin_bottom_mm), 0, 40),
    margin_left_mm: clamp(Number(input?.margin_left_mm ?? fallback.margin_left_mm), 0, 40),
    cols: Math.trunc(clamp(Number(input?.cols ?? fallback.cols), 1, 8)),
    rows: Math.trunc(clamp(Number(input?.rows ?? fallback.rows), 1, 10)),
    gap_x_mm: clamp(Number(input?.gap_x_mm ?? fallback.gap_x_mm), 0, 30),
    gap_y_mm: clamp(Number(input?.gap_y_mm ?? fallback.gap_y_mm), 0, 30),
    qr_size_mm: clamp(Number(input?.qr_size_mm ?? fallback.qr_size_mm), 8, 80),
    content_mode: contentMode,
    show_title: input?.show_title ?? fallback.show_title,
    show_subtitle: input?.show_subtitle ?? fallback.show_subtitle,
    show_meta: input?.show_meta ?? fallback.show_meta,
    show_link: kind === 'cards' ? (input?.show_link ?? fallback.show_link) : false,
    show_page_header: input?.show_page_header ?? fallback.show_page_header,
    meta_count: Math.trunc(clamp(Number(input?.meta_count ?? fallback.meta_count), 0, 6)),
    output_dpi: normalizeDpi(input?.output_dpi ?? fallback.output_dpi),
    label_preset: presetKey,
    printer_profile: normalizePrinterProfileKey((input as any)?.printer_profile ?? (fallback as any).printer_profile),
    qr_margin_modules: Math.trunc(clamp(Number((input as any)?.qr_margin_modules ?? (fallback as any).qr_margin_modules ?? 2), 1, 4)),
    safe_padding_mm: clamp(Number((input as any)?.safe_padding_mm ?? (fallback as any).safe_padding_mm ?? 1.2), 0.8, 4),
  };
  const printerProfile = getQrPrinterProfile(template.printer_profile);
  template.output_dpi = printerProfile.dpi;
  template.qr_margin_modules = Math.max(1, template.qr_margin_modules || printerProfile.marginModules);
  template.safe_padding_mm = Math.max(0.8, template.safe_padding_mm || printerProfile.safePaddingMm);
  if (template.label_preset !== 'none') {
    const preset = getQrLabelPreset(template.label_preset);
    if (preset) {
      template.paper_size = 'custom';
      template.orientation = 'landscape';
      template.custom_width_mm = preset.widthMm;
      template.custom_height_mm = preset.heightMm;
      template.cols = 1;
      template.rows = 1;
      template.gap_x_mm = 0;
      template.gap_y_mm = 0;
      template.show_page_header = false;
      template.show_link = false;
    }
  }
  return template;
}

export function resolveQrPaperDimensions(template: Partial<QrPrintTemplate>) {
  const size = template.paper_size === 'A5' ? { width: 148, height: 210 } : template.paper_size === 'custom' ? {
    width: clamp(Number(template.custom_width_mm || 0), 20, 500),
    height: clamp(Number(template.custom_height_mm || 0), 20, 500),
  } : { width: 210, height: 297 };
  const isLandscape = template.orientation === 'landscape';
  return {
    widthMm: isLandscape ? size.height : size.width,
    heightMm: isLandscape ? size.width : size.height,
  };
}

export function estimateQrCellSize(template: Partial<QrPrintTemplate>) {
  const normalized = normalizeQrPrintTemplate((template.kind as QrPrintTemplateKind) || 'cards', template);
  const { widthMm, heightMm } = resolveQrPaperDimensions(normalized);
  const headerHeight = normalized.show_page_header ? 14 : 0;
  const innerWidth = Math.max(20, widthMm - normalized.margin_left_mm - normalized.margin_right_mm);
  const innerHeight = Math.max(20, heightMm - normalized.margin_top_mm - normalized.margin_bottom_mm - headerHeight);
  const cellWidth = (innerWidth - normalized.gap_x_mm * (normalized.cols - 1)) / normalized.cols;
  const cellHeight = (innerHeight - normalized.gap_y_mm * (normalized.rows - 1)) / normalized.rows;
  return {
    widthMm: Math.max(10, Number(cellWidth.toFixed(1))),
    heightMm: Math.max(10, Number(cellHeight.toFixed(1))),
    pageWidthMm: widthMm,
    pageHeightMm: heightMm,
  };
}

function migrateLegacyStore() {
  const legacy = readJsonStorage<any>(LEGACY_STORAGE_KEY, null as any);
  if (!legacy || typeof legacy !== 'object') return null;
  const next = createFallbackStore();
  for (const kind of ['cards', 'sheet'] as QrPrintTemplateKind[]) {
    next.presets.generic[kind] = Array.isArray(legacy?.presets?.[kind])
      ? legacy.presets[kind].map((item: any) => ({ ...item, template: normalizeQrPrintTemplate(kind, item?.template) }))
      : [];
    next.defaults.generic[kind] = normalizeQrPrintTemplate(kind, legacy?.defaults?.[kind]);
  }
  writeJsonStorage(STORAGE_KEY, next);
  return next;
}

function readStore(): StoreState {
  const fallback = createFallbackStore();
  const raw = readJsonStorage<any>(STORAGE_KEY, null as any) || migrateLegacyStore() || fallback;
  const state = createFallbackStore();
  for (const scope of ['generic', 'pc', 'monitor'] as QrPrintTemplateScope[]) {
    const scopeKey = normalizeScope(scope);
    for (const kind of ['cards', 'sheet'] as QrPrintTemplateKind[]) {
      state.presets[scopeKey][kind] = Array.isArray(raw?.presets?.[scopeKey]?.[kind])
        ? raw.presets[scopeKey][kind].map((item: any) => ({ ...item, template: normalizeQrPrintTemplate(kind, item?.template) }))
        : scopeKey === 'generic' && Array.isArray(raw?.presets?.[kind])
          ? raw.presets[kind].map((item: any) => ({ ...item, template: normalizeQrPrintTemplate(kind, item?.template) }))
          : [];
      state.defaults[scopeKey][kind] = normalizeQrPrintTemplate(kind, raw?.defaults?.[scopeKey]?.[kind] || (scopeKey === 'generic' ? raw?.defaults?.[kind] : null));
      const lastUsed = raw?.last_used?.[scopeKey]?.[kind];
      if (lastUsed) {
        state.last_used[scopeKey] ||= {};
        state.last_used[scopeKey]![kind] = normalizeQrPrintTemplate(kind, lastUsed);
      }
    }
  }
  return state;
}

function writeStore(state: StoreState) {
  writeJsonStorage(STORAGE_KEY, state);
}

export function listSavedQrPrintPresets(kind: QrPrintTemplateKind, scope: QrPrintTemplateScope = 'generic') {
  const state = readStore();
  return state.presets[normalizeScope(scope)][kind];
}

export function getDefaultQrPrintTemplate(kind: QrPrintTemplateKind, scope: QrPrintTemplateScope = 'generic') {
  const state = readStore();
  return state.defaults[normalizeScope(scope)][kind];
}

export function getLastUsedQrPrintTemplate(kind: QrPrintTemplateKind, scope: QrPrintTemplateScope = 'generic') {
  const state = readStore();
  return state.last_used[normalizeScope(scope)]?.[kind] || null;
}

export function setLastUsedQrPrintTemplate(kind: QrPrintTemplateKind, template: Partial<QrPrintTemplate>, scope: QrPrintTemplateScope = 'generic') {
  const state = readStore();
  const scopeKey = normalizeScope(scope);
  state.last_used[scopeKey] ||= {};
  state.last_used[scopeKey]![kind] = normalizeQrPrintTemplate(kind, template);
  writeStore(state);
  return state.last_used[scopeKey]![kind]!;
}

export function setDefaultQrPrintTemplate(kind: QrPrintTemplateKind, template: Partial<QrPrintTemplate>, scope: QrPrintTemplateScope = 'generic') {
  const state = readStore();
  const scopeKey = normalizeScope(scope);
  state.defaults[scopeKey][kind] = normalizeQrPrintTemplate(kind, template);
  writeStore(state);
  return state.defaults[scopeKey][kind];
}

export function saveQrPrintPreset(kind: QrPrintTemplateKind, name: string, template: Partial<QrPrintTemplate>, scope: QrPrintTemplateScope = 'generic') {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new Error('请输入预设名称');
  const state = readStore();
  const scopeKey = normalizeScope(scope);
  const now = new Date().toISOString();
  const entry: SavedPreset = {
    id: `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    template: normalizeQrPrintTemplate(kind, template),
    created_at: now,
    updated_at: now,
  };
  state.presets[scopeKey][kind] = [entry, ...state.presets[scopeKey][kind]].slice(0, 20);
  writeStore(state);
  return entry;
}

export function deleteQrPrintPreset(kind: QrPrintTemplateKind, presetId: string, scope: QrPrintTemplateScope = 'generic') {
  const state = readStore();
  const scopeKey = normalizeScope(scope);
  state.presets[scopeKey][kind] = state.presets[scopeKey][kind].filter((item) => item.id !== presetId);
  writeStore(state);
}


export function exportQrPrintTemplate(kind: QrPrintTemplateKind, template: Partial<QrPrintTemplate>, scope: QrPrintTemplateScope = 'generic'): QrPrintTemplateExportFile {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    scope: normalizeScope(scope),
    kind,
    mode: 'template',
    template: normalizeQrPrintTemplate(kind, template),
  };
}

export function exportQrPrintTemplateBundle(kind: QrPrintTemplateKind, scope: QrPrintTemplateScope = 'generic'): QrPrintTemplateExportFile {
  const scopeKey = normalizeScope(scope);
  const state = readStore();
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    scope: scopeKey,
    kind,
    mode: 'bundle',
    template: getLastUsedQrPrintTemplate(kind, scopeKey) || getDefaultQrPrintTemplate(kind, scopeKey),
    default_template: state.defaults[scopeKey][kind],
    presets: state.presets[scopeKey][kind].map((item) => ({ name: item.name, template: item.template })),
  };
}

export function importQrPrintTemplateFile(kind: QrPrintTemplateKind, payload: unknown, scope: QrPrintTemplateScope = 'generic') {
  if (!payload || typeof payload !== 'object') throw new Error('模板文件格式不正确');
  const raw = payload as Record<string, any>;
  const fileKind = raw.kind === 'sheet' || raw.kind === 'cards' ? raw.kind : null;
  if (fileKind && fileKind !== kind) throw new Error(fileKind === 'sheet' ? '当前是标签模板，导入文件为二维码图版模板' : '当前是二维码图版模板，导入文件为标签模板');
  const scopeKey = normalizeScope(scope);
  const template = normalizeQrPrintTemplate(kind, raw.template || raw.default_template || raw);
  const importedPresetNames: string[] = [];
  const presetsInput = Array.isArray(raw.presets) ? raw.presets : [];
  for (const item of presetsInput) {
    const name = String(item?.name || '').trim();
    if (!name) continue;
    const entry = saveQrPrintPreset(kind, name, item?.template, scopeKey);
    importedPresetNames.push(entry.name);
  }
  if (raw.default_template) {
    setDefaultQrPrintTemplate(kind, raw.default_template, scopeKey);
  }
  setLastUsedQrPrintTemplate(kind, template, scopeKey);
  return {
    template,
    importedPresetNames,
    importedPresetCount: importedPresetNames.length,
    importedDefault: Boolean(raw.default_template),
  };
}
