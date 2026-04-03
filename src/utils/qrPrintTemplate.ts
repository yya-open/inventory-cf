import { readJsonStorage, writeJsonStorage } from './storage';

export type QrPrintTemplateKind = 'cards' | 'sheet';
export type QrPaperSize = 'A4' | 'A5' | 'custom';
export type QrOrientation = 'portrait' | 'landscape';
export type QrPrintContentMode = 'detail' | 'qr_only' | 'model_sn' | 'model_asset';
export type QrPrintDpi = 203 | 300;
export type QrLabelPresetKey = 'none' | '40x30' | '50x30' | '60x40' | '70x50';

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
};

type SavedPreset = {
  id: string;
  name: string;
  template: QrPrintTemplate;
  created_at: string;
  updated_at: string;
};

type StoreState = {
  presets: Record<QrPrintTemplateKind, SavedPreset[]>;
  defaults: Record<QrPrintTemplateKind, QrPrintTemplate>;
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

const STORAGE_KEY = 'inventory:qr-print-templates:v3';

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

export function listQrLabelPresets() {
  return LABEL_PRESETS.slice();
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
  };
}

export function createLabelPrinterTemplate(kind: QrPrintTemplateKind, presetKey: Exclude<QrLabelPresetKey, 'none'> = '60x40'): QrPrintTemplate {
  const preset = getQrLabelPreset(presetKey) || LABEL_PRESETS[2];
  const isSmall = preset.widthMm <= 50 || preset.heightMm <= 30;
  return {
    kind,
    paper_size: 'custom',
    orientation: 'landscape',
    custom_width_mm: preset.widthMm,
    custom_height_mm: preset.heightMm,
    margin_top_mm: 1.2,
    margin_right_mm: 1.2,
    margin_bottom_mm: 1.2,
    margin_left_mm: 1.2,
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
    output_dpi: preset.recommendedDpi,
    label_preset: preset.key,
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
  };
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

function readStore(): StoreState {
  const fallback: StoreState = {
    presets: { cards: [], sheet: [] },
    defaults: {
      cards: createDefaultQrPrintTemplate('cards'),
      sheet: createDefaultQrPrintTemplate('sheet'),
    },
  };
  const raw = readJsonStorage<StoreState>(STORAGE_KEY, fallback);
  return {
    presets: {
      cards: Array.isArray(raw?.presets?.cards) ? raw.presets.cards.map((item) => ({ ...item, template: normalizeQrPrintTemplate('cards', item?.template) })) : [],
      sheet: Array.isArray(raw?.presets?.sheet) ? raw.presets.sheet.map((item) => ({ ...item, template: normalizeQrPrintTemplate('sheet', item?.template) })) : [],
    },
    defaults: {
      cards: normalizeQrPrintTemplate('cards', raw?.defaults?.cards),
      sheet: normalizeQrPrintTemplate('sheet', raw?.defaults?.sheet),
    },
  };
}

function writeStore(state: StoreState) {
  writeJsonStorage(STORAGE_KEY, state);
}

export function listSavedQrPrintPresets(kind: QrPrintTemplateKind) {
  return readStore().presets[kind];
}

export function getDefaultQrPrintTemplate(kind: QrPrintTemplateKind) {
  return readStore().defaults[kind];
}

export function setDefaultQrPrintTemplate(kind: QrPrintTemplateKind, template: Partial<QrPrintTemplate>) {
  const state = readStore();
  state.defaults[kind] = normalizeQrPrintTemplate(kind, template);
  writeStore(state);
  return state.defaults[kind];
}

export function saveQrPrintPreset(kind: QrPrintTemplateKind, name: string, template: Partial<QrPrintTemplate>) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new Error('请输入预设名称');
  const state = readStore();
  const now = new Date().toISOString();
  const entry: SavedPreset = {
    id: `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    template: normalizeQrPrintTemplate(kind, template),
    created_at: now,
    updated_at: now,
  };
  state.presets[kind] = [entry, ...state.presets[kind]].slice(0, 20);
  writeStore(state);
  return entry;
}

export function deleteQrPrintPreset(kind: QrPrintTemplateKind, presetId: string) {
  const state = readStore();
  state.presets[kind] = state.presets[kind].filter((item) => item.id !== presetId);
  writeStore(state);
}
