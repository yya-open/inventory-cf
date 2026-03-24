import { readJsonStorage, writeJsonStorage } from './storage';

export type QrPrintTemplateKind = 'cards' | 'sheet';
export type QrPaperSize = 'A4' | 'A5' | 'custom';
export type QrOrientation = 'portrait' | 'landscape';

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
  show_title: boolean;
  show_subtitle: boolean;
  show_meta: boolean;
  show_link: boolean;
  meta_count: number;
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

const STORAGE_KEY = 'inventory:qr-print-templates:v1';

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function createDefaultQrPrintTemplate(kind: QrPrintTemplateKind): QrPrintTemplate {
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
      show_title: true,
      show_subtitle: true,
      show_meta: true,
      show_link: false,
      meta_count: 3,
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
    show_title: true,
    show_subtitle: true,
    show_meta: true,
    show_link: true,
    meta_count: 4,
  };
}

export function normalizeQrPrintTemplate(kind: QrPrintTemplateKind, input: Partial<QrPrintTemplate> | null | undefined): QrPrintTemplate {
  const fallback = createDefaultQrPrintTemplate(kind);
  const paperSize = input?.paper_size === 'A5' || input?.paper_size === 'custom' ? input.paper_size : fallback.paper_size;
  const orientation = input?.orientation === 'portrait' ? 'portrait' : fallback.orientation;
  const template: QrPrintTemplate = {
    kind,
    paper_size: paperSize,
    orientation,
    custom_width_mm: clamp(Number(input?.custom_width_mm ?? fallback.custom_width_mm), 40, 500),
    custom_height_mm: clamp(Number(input?.custom_height_mm ?? fallback.custom_height_mm), 40, 500),
    margin_top_mm: clamp(Number(input?.margin_top_mm ?? fallback.margin_top_mm), 0, 40),
    margin_right_mm: clamp(Number(input?.margin_right_mm ?? fallback.margin_right_mm), 0, 40),
    margin_bottom_mm: clamp(Number(input?.margin_bottom_mm ?? fallback.margin_bottom_mm), 0, 40),
    margin_left_mm: clamp(Number(input?.margin_left_mm ?? fallback.margin_left_mm), 0, 40),
    cols: Math.trunc(clamp(Number(input?.cols ?? fallback.cols), 1, 8)),
    rows: Math.trunc(clamp(Number(input?.rows ?? fallback.rows), 1, 10)),
    gap_x_mm: clamp(Number(input?.gap_x_mm ?? fallback.gap_x_mm), 0, 30),
    gap_y_mm: clamp(Number(input?.gap_y_mm ?? fallback.gap_y_mm), 0, 30),
    qr_size_mm: clamp(Number(input?.qr_size_mm ?? fallback.qr_size_mm), 10, 80),
    show_title: input?.show_title !== false,
    show_subtitle: input?.show_subtitle !== false,
    show_meta: input?.show_meta !== false,
    show_link: kind === 'cards' ? input?.show_link !== false : false,
    meta_count: Math.trunc(clamp(Number(input?.meta_count ?? fallback.meta_count), 0, 6)),
  };
  return template;
}

export function resolveQrPaperDimensions(template: Partial<QrPrintTemplate>) {
  const size = template.paper_size === 'A5' ? { width: 148, height: 210 } : template.paper_size === 'custom' ? {
    width: clamp(Number(template.custom_width_mm || 0), 40, 500),
    height: clamp(Number(template.custom_height_mm || 0), 40, 500),
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
  const headerHeight = 14;
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
