import { ref, watch, type Ref } from 'vue';
import type { MonitorFilters } from '../../types/assets';
import { readJsonStorage, writeJsonStorage } from '../../utils/storage';
import { createIdleDebounced } from '../../utils/idleDebounce';
import { moveColumnKey, normalizeColumnOrder, normalizeColumnWidths, normalizeVisibleColumns, orderVisibleColumns, setColumnWidth } from '../../utils/tableColumns';
import { findLedgerSavedView, normalizeLedgerDensity, removeLedgerSavedView, sanitizeLedgerViewName, upsertLedgerSavedView, type LedgerSavedView, type LedgerTableDensity } from '../../utils/ledgerViewPrefs';

const STORAGE_KEY = 'inventory:monitor-assets:filters';
const LEDGER_DEFAULT_PAGE_SIZE = 20;
const LEGACY_DEFAULT_PAGE_SIZE = 50;
export const MONITOR_COLUMN_OPTIONS = [
  { value: 'assetCode', label: '资产编号' },
  { value: 'inventory', label: '盘点状态' },
  { value: 'model', label: '型号' },
  { value: 'status', label: '状态' },
  { value: 'owner', label: '领用信息' },
  { value: 'location', label: '位置' },
  { value: 'brand', label: '品牌' },
  { value: 'serialNo', label: 'SN' },
  { value: 'sizeInch', label: '尺寸' },
  { value: 'remark', label: '备注' },
  { value: 'archiveReason', label: '归档原因' },
  { value: 'updatedAt', label: '更新时间' },
] as const;
const MONITOR_COLUMN_KEYS = MONITOR_COLUMN_OPTIONS.map((item) => item.value);

function promoteInventoryColumn(order: string[], anchor: string) {
  const normalized = [...order.filter(Boolean)];
  const inventoryIndex = normalized.indexOf('inventory');
  if (inventoryIndex >= 0) normalized.splice(inventoryIndex, 1);
  const anchorIndex = normalized.indexOf(anchor);
  normalized.splice(anchorIndex >= 0 ? anchorIndex + 1 : 0, 0, 'inventory');
  return normalizeColumnOrder(normalized, MONITOR_COLUMN_KEYS);
}

type ArchiveMode = 'active' | 'archived' | 'all';

type PersistedMonitorAssetViewState = {
  status?: string;
  locationId?: string;
  inventoryStatus?: string;
  keyword?: string;
  archiveReason?: string;
  archiveMode?: ArchiveMode;
  showArchived?: boolean;
  defaultViewName?: string;
  pageSize?: number;
  visibleColumns?: string[];
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  density?: LedgerTableDensity;
  savedViews?: LedgerSavedView[];
  activeViewName?: string;
};

function clampPageSize(value: unknown) {
  return Math.min(200, Math.max(20, Number(value || LEDGER_DEFAULT_PAGE_SIZE) || LEDGER_DEFAULT_PAGE_SIZE));
}

export function useMonitorAssetViewState(onAutoSearch: () => void) {
  const persistedState = readJsonStorage<PersistedMonitorAssetViewState>(STORAGE_KEY, {
    status: '',
    locationId: '',
    inventoryStatus: '',
    keyword: '',
    archiveReason: '',
    archiveMode: 'active',
    showArchived: false,
    defaultViewName: '',
    pageSize: LEDGER_DEFAULT_PAGE_SIZE,
    visibleColumns: MONITOR_COLUMN_KEYS,
    columnOrder: MONITOR_COLUMN_KEYS,
    columnWidths: {},
    density: 'default',
    savedViews: [],
    activeViewName: 'default',
  });

  const status = ref(String(persistedState.status || ''));
  const locationId = ref(String(persistedState.locationId || ''));
  const inventoryStatus = ref(String(persistedState.inventoryStatus || ''));
  const keyword = ref(String(persistedState.keyword || ''));
  const archiveReason = ref(String(persistedState.archiveReason || ''));
  const archiveMode = ref<ArchiveMode>((persistedState.archiveMode || (persistedState.showArchived ? 'all' : 'active')) as ArchiveMode);
  const showArchived = ref(Boolean(persistedState.showArchived || archiveMode.value !== 'active'));
  const previousDefaultOrder = ['assetCode', 'model', 'status', 'inventory', 'location', 'owner', 'brand', 'serialNo', 'sizeInch', 'remark', 'archiveReason', 'updatedAt'];
  const normalizedStoredOrder = normalizeColumnOrder(persistedState.columnOrder, MONITOR_COLUMN_KEYS);
  const shouldPromoteInventory = JSON.stringify(normalizedStoredOrder) === JSON.stringify(previousDefaultOrder);
  const columnOrder = ref(shouldPromoteInventory ? promoteInventoryColumn(normalizedStoredOrder, 'assetCode') : normalizedStoredOrder);
  const initialVisibleColumns = orderVisibleColumns(normalizeVisibleColumns(persistedState.visibleColumns, MONITOR_COLUMN_KEYS), columnOrder.value);
  if (!initialVisibleColumns.includes('inventory')) {
    const assetCodeIndex = initialVisibleColumns.indexOf('assetCode');
    if (assetCodeIndex >= 0) initialVisibleColumns.splice(assetCodeIndex + 1, 0, 'inventory');
    else initialVisibleColumns.unshift('inventory');
  } else if (shouldPromoteInventory) {
    const inventoryIndex = initialVisibleColumns.indexOf('inventory');
    const assetCodeIndex = initialVisibleColumns.indexOf('assetCode');
    if (inventoryIndex >= 0) initialVisibleColumns.splice(inventoryIndex, 1);
    initialVisibleColumns.splice(assetCodeIndex >= 0 ? assetCodeIndex + 1 : 0, 0, 'inventory');
  }
  const visibleColumns = ref(initialVisibleColumns);
  const columnWidths = ref(normalizeColumnWidths(persistedState.columnWidths, MONITOR_COLUMN_KEYS));
  const density = ref<LedgerTableDensity>(normalizeLedgerDensity(persistedState.density));
  const savedViews = ref<LedgerSavedView[]>(Array.isArray(persistedState.savedViews) ? persistedState.savedViews : []);
  const activeViewName = ref(sanitizeLedgerViewName(persistedState.activeViewName) || 'default');
  const defaultViewName = ref(sanitizeLedgerViewName(persistedState.defaultViewName) || '');

  const initialPageSize = clampPageSize(persistedState.pageSize);
  const shouldMigrateLegacyDefaultPageSize = Number(persistedState.pageSize || 0) === LEGACY_DEFAULT_PAGE_SIZE;
  const monitorColumnOptions = [...MONITOR_COLUMN_OPTIONS];

  let suppressAutoSearch = false;
  let keywordTimer: ReturnType<typeof setTimeout> | null = null;
  let pageSizeRef: Ref<number> | null = null;

  function currentFilters(): MonitorFilters {
    return {
      status: status.value || '',
      locationId: String(locationId.value || ''),
      keyword: keyword.value || '',
      inventoryStatus: inventoryStatus.value || '',
      archiveReason: archiveMode.value !== 'active' ? (archiveReason.value || '') : '',
      archiveMode: archiveMode.value,
      showArchived: Boolean(showArchived.value || archiveMode.value !== 'active'),
    };
  }

  function persistState() {
    writeJsonStorage(STORAGE_KEY, {
      status: status.value || '',
      locationId: String(locationId.value || ''),
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
    });
  }

  function clearKeywordTimer() {
    if (keywordTimer) {
      clearTimeout(keywordTimer);
      keywordTimer = null;
    }
  }

  function scheduleKeywordSearch() {
    clearKeywordTimer();
    keywordTimer = setTimeout(() => {
      onAutoSearch();
    }, 320);
  }

  const schedulePersistState = createIdleDebounced(() => persistState(), 280);

  function bindPersistence(pageSize: Ref<number>) {
    pageSizeRef = pageSize;
    if (shouldMigrateLegacyDefaultPageSize && Number(pageSize.value || 0) === LEGACY_DEFAULT_PAGE_SIZE) {
      pageSize.value = LEDGER_DEFAULT_PAGE_SIZE;
    }
    watch([status, locationId, inventoryStatus, keyword, archiveReason, archiveMode, showArchived, pageSize, visibleColumns, columnOrder, columnWidths, density, savedViews, activeViewName, defaultViewName], () => schedulePersistState(), { deep: true });
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
    visibleColumns.value = orderVisibleColumns(normalizeVisibleColumns(value, MONITOR_COLUMN_KEYS), columnOrder.value);
  }

  function restoreDefaultColumns() {
    columnOrder.value = [...MONITOR_COLUMN_KEYS];
    visibleColumns.value = [...MONITOR_COLUMN_KEYS];
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
    savedViews.value = upsertLedgerSavedView(savedViews.value, {
      name: nextName,
      visibleColumns: [...visibleColumns.value],
      columnOrder: [...columnOrder.value],
      columnWidths: { ...columnWidths.value },
      density: density.value,
      pageSize: clampPageSize(pageSizeRef?.value || initialPageSize),
      filters: {
        status: status.value || '',
        locationId: String(locationId.value || ''),
        keyword: keyword.value || '',
        inventoryStatus: inventoryStatus.value || '',
        archiveReason: archiveReason.value || '',
        archiveMode: archiveMode.value,
      },
      updatedAt: new Date().toISOString(),
    });
    activeViewName.value = nextName;
    return nextName;
  }

  function applySavedView(name: string) {
    const matched = findLedgerSavedView(savedViews.value, name);
    if (!matched) return false;
    runWithoutAutoSearch(() => {
      columnOrder.value = normalizeColumnOrder(matched.columnOrder, MONITOR_COLUMN_KEYS);
      visibleColumns.value = orderVisibleColumns(normalizeVisibleColumns(matched.visibleColumns, MONITOR_COLUMN_KEYS), columnOrder.value);
      columnWidths.value = normalizeColumnWidths(matched.columnWidths, MONITOR_COLUMN_KEYS);
      density.value = normalizeLedgerDensity(matched.density);
      if (pageSizeRef && matched.pageSize) pageSizeRef.value = clampPageSize(matched.pageSize);

      const filters = (matched.filters && typeof matched.filters === 'object') ? matched.filters as Record<string, unknown> : null;
      if (filters) {
        status.value = String(filters.status || '');
        locationId.value = String(filters.locationId || '');
        keyword.value = String(filters.keyword || '');
        inventoryStatus.value = String(filters.inventoryStatus || '');
        archiveReason.value = String(filters.archiveReason || '');
        const nextArchiveMode = String(filters.archiveMode || 'active') as ArchiveMode;
        archiveMode.value = ['active', 'archived', 'all'].includes(nextArchiveMode) ? nextArchiveMode : 'active';
        showArchived.value = archiveMode.value !== 'active';
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
    try {
      fn();
    } finally {
      suppressAutoSearch = false;
    }
  }

  function cleanup() {
    clearKeywordTimer();
    schedulePersistState.flush();
    schedulePersistState.cancel();
  }

  return {
    status,
    locationId,
    inventoryStatus,
    keyword,
    archiveReason,
    archiveMode,
    showArchived,
    columnOrder,
    visibleColumns,
    columnWidths,
    density,
    savedViews,
    activeViewName,
    defaultViewName,
    initialPageSize,
    monitorColumnOptions,
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
