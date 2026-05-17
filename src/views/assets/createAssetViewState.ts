import { ref, watch, type Ref } from 'vue';
import { readJsonStorage, writeJsonStorage } from '../../utils/storage';
import { createIdleDebounced } from '../../utils/idleDebounce';
import { moveColumnKey, normalizeColumnOrder, normalizeColumnWidths, normalizeVisibleColumns, orderVisibleColumns, setColumnWidth } from '../../utils/tableColumns';
import { findLedgerSavedView, normalizeLedgerDensity, removeLedgerSavedView, sanitizeLedgerViewName, upsertLedgerSavedView, type LedgerSavedView, type LedgerTableDensity } from '../../utils/ledgerViewPrefs';

type ArchiveMode = 'active' | 'archived' | 'all';

export type AssetViewStateConfig<TFilters> = {
  storageKey: string;
  columnOptions: ReadonlyArray<{ value: string; label: string }>;
  previousDefaultOrder?: string[];
  inventoryAnchorColumn: string;
  extraFilterKeys?: string[];
  buildFilters: (base: { status: string; keyword: string; inventoryStatus: string; archiveReason: string; archiveMode: ArchiveMode; showArchived: boolean }, extras: Record<string, string>) => TFilters;
  extraFilterDefaults?: Record<string, string>;
};

const LEDGER_DEFAULT_PAGE_SIZE = 20;
const LEGACY_DEFAULT_PAGE_SIZE = 50;

function clampPageSize(value: unknown) {
  return Math.min(200, Math.max(20, Number(value || LEDGER_DEFAULT_PAGE_SIZE) || LEDGER_DEFAULT_PAGE_SIZE));
}

export function createAssetViewState<TFilters>(config: AssetViewStateConfig<TFilters>, onAutoSearch: () => void) {
  const COLUMN_KEYS = config.columnOptions.map((item) => item.value);

  function promoteInventoryColumn(order: string[]) {
    const normalized = [...order.filter(Boolean)];
    const inventoryIndex = normalized.indexOf('inventory');
    if (inventoryIndex >= 0) normalized.splice(inventoryIndex, 1);
    const anchorIndex = normalized.indexOf(config.inventoryAnchorColumn);
    normalized.splice(anchorIndex >= 0 ? anchorIndex + 1 : 0, 0, 'inventory');
    return normalizeColumnOrder(normalized, COLUMN_KEYS);
  }

  const persistedState = readJsonStorage<Record<string, unknown>>(config.storageKey, {
    status: '',
    inventoryStatus: '',
    keyword: '',
    archiveReason: '',
    archiveMode: 'active',
    showArchived: false,
    defaultViewName: '',
    pageSize: LEDGER_DEFAULT_PAGE_SIZE,
    visibleColumns: COLUMN_KEYS,
    columnOrder: COLUMN_KEYS,
    columnWidths: {},
    density: 'default',
    savedViews: [],
    activeViewName: 'default',
    ...(config.extraFilterDefaults || {}),
  });

  const status = ref(String(persistedState.status || ''));
  const inventoryStatus = ref(String(persistedState.inventoryStatus || ''));
  const keyword = ref(String(persistedState.keyword || ''));
  const archiveReason = ref(String(persistedState.archiveReason || ''));
  const archiveMode = ref<ArchiveMode>((String(persistedState.archiveMode || (persistedState.showArchived ? 'all' : 'active')) as ArchiveMode));
  const showArchived = ref(Boolean(persistedState.showArchived || archiveMode.value !== 'active'));

  const extraRefs: Record<string, Ref<string>> = {};
  for (const key of (config.extraFilterKeys || [])) {
    extraRefs[key] = ref(String((persistedState as Record<string, unknown>)[key] || ''));
  }

  const normalizedStoredOrder = normalizeColumnOrder(persistedState.columnOrder as string[] | undefined, COLUMN_KEYS);
  const shouldPromoteInventory = config.previousDefaultOrder ? JSON.stringify(normalizedStoredOrder) === JSON.stringify(config.previousDefaultOrder) : false;
  const columnOrder = ref(shouldPromoteInventory ? promoteInventoryColumn(normalizedStoredOrder) : normalizedStoredOrder);

  const initialVisibleColumns = orderVisibleColumns(normalizeVisibleColumns(persistedState.visibleColumns as string[] | undefined, COLUMN_KEYS), columnOrder.value);
  if (!initialVisibleColumns.includes('inventory')) {
    const anchorIndex = initialVisibleColumns.indexOf(config.inventoryAnchorColumn);
    if (anchorIndex >= 0) initialVisibleColumns.splice(anchorIndex + 1, 0, 'inventory');
    else initialVisibleColumns.unshift('inventory');
  } else if (shouldPromoteInventory) {
    const inventoryIndex = initialVisibleColumns.indexOf('inventory');
    const anchorIndex = initialVisibleColumns.indexOf(config.inventoryAnchorColumn);
    if (inventoryIndex >= 0) initialVisibleColumns.splice(inventoryIndex, 1);
    initialVisibleColumns.splice(anchorIndex >= 0 ? anchorIndex + 1 : 0, 0, 'inventory');
  }
  const visibleColumns = ref(initialVisibleColumns);
  const columnWidths = ref(normalizeColumnWidths(persistedState.columnWidths as Record<string, number> | undefined, COLUMN_KEYS));
  const density = ref<LedgerTableDensity>(normalizeLedgerDensity(persistedState.density as string | undefined));
  const savedViews = ref<LedgerSavedView[]>(Array.isArray(persistedState.savedViews) ? persistedState.savedViews as LedgerSavedView[] : []);
  const activeViewName = ref(sanitizeLedgerViewName(persistedState.activeViewName as string | undefined) || 'default');
  const defaultViewName = ref(sanitizeLedgerViewName(persistedState.defaultViewName as string | undefined) || '');

  const initialPageSize = clampPageSize(persistedState.pageSize);
  const shouldMigrateLegacyDefaultPageSize = Number(persistedState.pageSize || 0) === LEGACY_DEFAULT_PAGE_SIZE;
  const columnOptions = [...config.columnOptions];

  let suppressAutoSearch = false;
  let keywordTimer: ReturnType<typeof setTimeout> | null = null;
  let pageSizeRef: Ref<number> | null = null;

  function getExtras(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key of (config.extraFilterKeys || [])) {
      result[key] = extraRefs[key]?.value || '';
    }
    return result;
  }

  function currentFilters(): TFilters {
    return config.buildFilters({
      status: status.value || '',
      keyword: keyword.value || '',
      inventoryStatus: inventoryStatus.value || '',
      archiveReason: archiveMode.value !== 'active' ? (archiveReason.value || '') : '',
      archiveMode: archiveMode.value,
      showArchived: Boolean(showArchived.value || archiveMode.value !== 'active'),
    }, getExtras());
  }

  function persistState() {
    const data: Record<string, unknown> = {
      status: status.value || '',
      keyword: keyword.value || '',
      inventoryStatus: inventoryStatus.value || '',
      showArchived: Boolean(showArchived.value || archiveMode.value !== 'active'),
      archiveMode: archiveMode.value,
      archiveReason: archiveReason.value || '',
      defaultViewName: defaultViewName.value,
      pageSize: clampPageSize(pageSizeRef?.value || initialPageSize),
      visibleColumns: visibleColumns.value,
      columnOrder: columnOrder.value,
      columnWidths: columnWidths.value,
      density: density.value,
      savedViews: savedViews.value,
      activeViewName: activeViewName.value,
    };
    for (const key of (config.extraFilterKeys || [])) {
      data[key] = extraRefs[key]?.value || '';
    }
    writeJsonStorage(config.storageKey, data);
  }

  function clearKeywordTimer() {
    if (keywordTimer) {
      clearTimeout(keywordTimer);
      keywordTimer = null;
    }
  }

  function scheduleKeywordSearch() {
    clearKeywordTimer();
    keywordTimer = setTimeout(() => { onAutoSearch(); }, 320);
  }

  const schedulePersistState = createIdleDebounced(() => persistState(), 280);

  function bindPersistence(pageSize: Ref<number>) {
    pageSizeRef = pageSize;
    if (shouldMigrateLegacyDefaultPageSize && Number(pageSize.value || 0) === LEGACY_DEFAULT_PAGE_SIZE) {
      pageSize.value = LEDGER_DEFAULT_PAGE_SIZE;
    }
    const watchTargets: Ref[] = [status, inventoryStatus, keyword, archiveReason, archiveMode, showArchived, pageSize, visibleColumns, columnOrder, columnWidths, density, savedViews, activeViewName, defaultViewName];
    for (const key of (config.extraFilterKeys || [])) watchTargets.push(extraRefs[key]);
    watch(watchTargets, () => schedulePersistState(), { deep: true });
    watch(keyword, (_value, oldValue) => {
      if (suppressAutoSearch || oldValue === undefined) return;
      scheduleKeywordSearch();
    });
    watch(archiveMode, (value) => {
      showArchived.value = value !== 'active';
      if (value === 'active') archiveReason.value = '';
    });
    watch(archiveReason, (_value, oldValue) => {
      if (suppressAutoSearch || oldValue === undefined) return;
      scheduleKeywordSearch();
    });
  }

  function updateVisibleColumns(value: string[]) {
    visibleColumns.value = orderVisibleColumns(normalizeVisibleColumns(value, COLUMN_KEYS), columnOrder.value);
  }

  function restoreDefaultColumns() {
    columnOrder.value = [...COLUMN_KEYS];
    visibleColumns.value = [...COLUMN_KEYS];
    columnWidths.value = {};
    density.value = 'default';
    activeViewName.value = 'default';
  }

  function moveVisibleColumn(key: string, direction: 'up' | 'down') {
    columnOrder.value = moveColumnKey(columnOrder.value, key, direction);
    visibleColumns.value = orderVisibleColumns(visibleColumns.value, columnOrder.value);
  }

  function updateColumnWidth(payload: { key: string; width: number }) {
    if (!payload?.key) return;
    columnWidths.value = setColumnWidth(columnWidths.value, payload.key, payload.width);
  }

  function setDensity(nextDensity: LedgerTableDensity) {
    density.value = normalizeLedgerDensity(nextDensity);
  }

  function saveCurrentView(name: string) {
    const nextName = sanitizeLedgerViewName(name);
    if (!nextName) return '';
    const filters: Record<string, unknown> = {
      status: status.value || '',
      keyword: keyword.value || '',
      inventoryStatus: inventoryStatus.value || '',
      archiveReason: archiveReason.value || '',
      archiveMode: archiveMode.value,
    };
    for (const key of (config.extraFilterKeys || [])) {
      filters[key] = extraRefs[key]?.value || '';
    }
    savedViews.value = upsertLedgerSavedView(savedViews.value, {
      name: nextName,
      visibleColumns: [...visibleColumns.value],
      columnOrder: [...columnOrder.value],
      columnWidths: { ...columnWidths.value },
      density: density.value,
      pageSize: clampPageSize(pageSizeRef?.value || initialPageSize),
      filters,
      updatedAt: new Date().toISOString(),
    });
    activeViewName.value = nextName;
    return nextName;
  }

  function applySavedView(name: string) {
    const matched = findLedgerSavedView(savedViews.value, name);
    if (!matched) return false;
    runWithoutAutoSearch(() => {
      columnOrder.value = normalizeColumnOrder(matched.columnOrder, COLUMN_KEYS);
      visibleColumns.value = orderVisibleColumns(normalizeVisibleColumns(matched.visibleColumns, COLUMN_KEYS), columnOrder.value);
      columnWidths.value = normalizeColumnWidths(matched.columnWidths, COLUMN_KEYS);
      density.value = normalizeLedgerDensity(matched.density);
      if (pageSizeRef && matched.pageSize) pageSizeRef.value = clampPageSize(matched.pageSize);
      const filters = (matched.filters && typeof matched.filters === 'object') ? matched.filters as Record<string, unknown> : null;
      if (filters) {
        status.value = String(filters.status || '');
        keyword.value = String(filters.keyword || '');
        inventoryStatus.value = String(filters.inventoryStatus || '');
        archiveReason.value = String(filters.archiveReason || '');
        const nextArchiveMode = String(filters.archiveMode || 'active') as ArchiveMode;
        archiveMode.value = ['active', 'archived', 'all'].includes(nextArchiveMode) ? nextArchiveMode : 'active';
        showArchived.value = archiveMode.value !== 'active';
        for (const key of (config.extraFilterKeys || [])) {
          if (extraRefs[key]) extraRefs[key].value = String(filters[key] || '');
        }
      }
      activeViewName.value = matched.name;
    });
    return true;
  }

  function deleteSavedView(name: string) {
    const normalized = sanitizeLedgerViewName(name);
    if (!normalized) return false;
    const nextViews = removeLedgerSavedView(savedViews.value, normalized);
    if (nextViews.length === savedViews.value.length) return false;
    savedViews.value = nextViews;
    if (activeViewName.value === normalized) activeViewName.value = 'default';
    if (defaultViewName.value === normalized) defaultViewName.value = '';
    return true;
  }

  function setDefaultSavedView(name: string) {
    const normalized = sanitizeLedgerViewName(name);
    if (!normalized) return false;
    if (!findLedgerSavedView(savedViews.value, normalized)) return false;
    defaultViewName.value = normalized;
    return true;
  }

  function clearDefaultSavedView() {
    const hadDefault = !!defaultViewName.value;
    defaultViewName.value = '';
    return hadDefault;
  }

  function getDefaultSavedView() {
    const normalized = sanitizeLedgerViewName(defaultViewName.value);
    if (!normalized) return null;
    return findLedgerSavedView(savedViews.value, normalized);
  }

  function runWithoutAutoSearch(fn: () => void) {
    suppressAutoSearch = true;
    try { fn(); } finally { suppressAutoSearch = false; }
  }

  function cleanup() {
    clearKeywordTimer();
    schedulePersistState.flush();
    schedulePersistState.cancel();
  }

  return {
    status,
    inventoryStatus,
    keyword,
    archiveReason,
    archiveMode,
    showArchived,
    extraRefs,
    columnOrder,
    visibleColumns,
    columnWidths,
    density,
    savedViews,
    activeViewName,
    defaultViewName,
    initialPageSize,
    columnOptions,
    currentFilters,
    clearKeywordTimer,
    bindPersistence,
    cleanup,
    updateVisibleColumns,
    restoreDefaultColumns,
    moveVisibleColumn,
    updateColumnWidth,
    setDensity,
    saveCurrentView,
    applySavedView,
    deleteSavedView,
    setDefaultSavedView,
    clearDefaultSavedView,
    getDefaultSavedView,
    runWithoutAutoSearch,
  };
}
