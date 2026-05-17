import { readJsonStorage, writeJsonStorage } from './storage';
import {
  applyQrLabelPreset,
  applyQrPrinterProfile,
  createDefaultQrPrintTemplate,
  estimateQrCellSize,
  getQrLabelPreset,
  getQrPrinterProfile,
  listQrLabelPresets,
  listQrPrinterProfiles,
  normalizeQrPrintTemplate,
  resolveQrPaperDimensions,
  type QrPrintContentMode,
  type QrPrintTemplate,
  type QrPrintTemplateKind,
  type QrPrintTemplateScope,
} from '../../shared/qr-print-template';

export {
  applyQrLabelPreset,
  applyQrPrinterProfile,
  createDefaultQrPrintTemplate,
  estimateQrCellSize,
  getQrLabelPreset,
  getQrPrinterProfile,
  listQrLabelPresets,
  listQrPrinterProfiles,
  normalizeQrPrintTemplate,
  resolveQrPaperDimensions,
  type QrLabelPreset,
  type QrLabelPresetKey,
  type QrOrientation,
  type QrPaperSize,
  type QrPrinterProfile,
  type QrPrinterProfileKey,
  type QrPrintContentMode,
  type QrPrintDpi,
  type QrPrintTemplate,
  type QrPrintTemplateKind,
  type QrPrintTemplateScope,
} from '../../shared/qr-print-template';

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

const STORAGE_KEY = 'inventory:qr-print-templates:v5';
const LEGACY_STORAGE_KEY = 'inventory:qr-print-templates:v4';


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
