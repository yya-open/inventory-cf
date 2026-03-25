import { ref, watch, type Ref } from 'vue';
import type { PcFilters } from '../../types/assets';
import { getCachedSystemSettings } from '../../api/systemSettings';
import { readJsonStorage, writeJsonStorage } from '../../utils/storage';
import { createIdleDebounced } from '../../utils/idleDebounce';
import { moveColumnKey, normalizeColumnOrder, normalizeColumnWidths, normalizeVisibleColumns, orderVisibleColumns, setColumnWidth } from '../../utils/tableColumns';

const STORAGE_KEY = 'inventory:pc-assets:filters';
export const PC_COLUMN_OPTIONS = [
  { value: 'computer', label: '电脑' },
  { value: 'inventory', label: '盘点状态' },
  { value: 'status', label: '状态' },
  { value: 'config', label: '配置' },
  { value: 'owner', label: '当前领用人' },
  { value: 'configDate', label: '配置日期' },
  { value: 'recycleDate', label: '回收日期' },
  { value: 'remark', label: '备注' },
] as const;
const PC_COLUMN_KEYS = PC_COLUMN_OPTIONS.map((item) => item.value);

function promoteInventoryColumn(order: string[], anchor: string) {
  const normalized = [...order.filter(Boolean)];
  const inventoryIndex = normalized.indexOf('inventory');
  if (inventoryIndex >= 0) normalized.splice(inventoryIndex, 1);
  const anchorIndex = normalized.indexOf(anchor);
  normalized.splice(anchorIndex >= 0 ? anchorIndex + 1 : 0, 0, 'inventory');
  return normalizeColumnOrder(normalized, PC_COLUMN_KEYS);
}

type ArchiveMode = 'active' | 'archived' | 'all';

type PersistedPcAssetViewState = {
  status?: string;
  inventoryStatus?: string;
  keyword?: string;
  archiveReason?: string;
  archiveMode?: ArchiveMode;
  showArchived?: boolean;
  pageSize?: number;
  visibleColumns?: string[];
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
};

export function usePcAssetViewState(onAutoSearch: () => void) {
  const persistedState = readJsonStorage<PersistedPcAssetViewState>(STORAGE_KEY, {
    status: '',
    inventoryStatus: '',
    keyword: '',
    archiveReason: '',
    archiveMode: 'active',
    showArchived: false,
    pageSize: getCachedSystemSettings().ui_default_page_size,
    visibleColumns: PC_COLUMN_KEYS,
    columnOrder: PC_COLUMN_KEYS,
    columnWidths: {},
  });

  const status = ref(String(persistedState.status || ''));
  const inventoryStatus = ref(String(persistedState.inventoryStatus || ''));
  const keyword = ref(String(persistedState.keyword || ''));
  const archiveReason = ref(String(persistedState.archiveReason || ''));
  const archiveMode = ref<ArchiveMode>((persistedState.archiveMode || (persistedState.showArchived ? 'all' : 'active')) as ArchiveMode);
  const showArchived = ref(Boolean(persistedState.showArchived || archiveMode.value !== 'active'));
  const previousDefaultOrder = ['computer', 'config', 'status', 'inventory', 'owner', 'configDate', 'recycleDate', 'remark'];
  const normalizedStoredOrder = normalizeColumnOrder(persistedState.columnOrder, PC_COLUMN_KEYS);
  const shouldPromoteInventory = JSON.stringify(normalizedStoredOrder) === JSON.stringify(previousDefaultOrder);
  const columnOrder = ref(shouldPromoteInventory ? promoteInventoryColumn(normalizedStoredOrder, 'computer') : normalizedStoredOrder);
  const initialVisibleColumns = orderVisibleColumns(normalizeVisibleColumns(persistedState.visibleColumns, PC_COLUMN_KEYS), columnOrder.value);
  if (!initialVisibleColumns.includes('inventory')) {
    const computerIndex = initialVisibleColumns.indexOf('computer');
    if (computerIndex >= 0) initialVisibleColumns.splice(computerIndex + 1, 0, 'inventory');
    else initialVisibleColumns.unshift('inventory');
  } else if (shouldPromoteInventory) {
    const inventoryIndex = initialVisibleColumns.indexOf('inventory');
    const computerIndex = initialVisibleColumns.indexOf('computer');
    if (inventoryIndex >= 0) initialVisibleColumns.splice(inventoryIndex, 1);
    initialVisibleColumns.splice(computerIndex >= 0 ? computerIndex + 1 : 0, 0, 'inventory');
  }
  const visibleColumns = ref(initialVisibleColumns);
  const columnWidths = ref(normalizeColumnWidths(persistedState.columnWidths, PC_COLUMN_KEYS));

  const initialPageSize = Number(persistedState.pageSize || getCachedSystemSettings().ui_default_page_size || 50);
  const pcColumnOptions = [...PC_COLUMN_OPTIONS];

  let suppressAutoSearch = false;
  let keywordTimer: ReturnType<typeof setTimeout> | null = null;
  let pageSizeRef: Ref<number> | null = null;

  function currentFilters(): PcFilters {
    return {
      status: status.value || '',
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
      keyword: keyword.value || '',
      inventoryStatus: inventoryStatus.value || '',
      showArchived: Boolean(showArchived.value || archiveMode.value !== 'active'),
      archiveMode: archiveMode.value,
      archiveReason: archiveReason.value || '',
      pageSize: Number(pageSizeRef?.value || initialPageSize || 50),
      visibleColumns: visibleColumns.value,
      columnOrder: columnOrder.value,
      columnWidths: columnWidths.value,
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
    watch([status, inventoryStatus, keyword, archiveReason, archiveMode, showArchived, pageSize, visibleColumns, columnOrder, columnWidths], () => schedulePersistState());
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
    visibleColumns.value = orderVisibleColumns(normalizeVisibleColumns(value, PC_COLUMN_KEYS), columnOrder.value);
  }

  function restoreDefaultColumns() {
    columnOrder.value = [...PC_COLUMN_KEYS];
    visibleColumns.value = [...PC_COLUMN_KEYS];
    columnWidths.value = {};
  }

  function moveVisibleColumn(key: string, direction: 'up' | 'down') {
    columnOrder.value = moveColumnKey(columnOrder.value, key, direction);
    visibleColumns.value = orderVisibleColumns(visibleColumns.value, columnOrder.value);
  }

  function updateColumnWidth(payload: { key: string; width: number }) {
    if (!payload?.key) return;
    columnWidths.value = setColumnWidth(columnWidths.value, payload.key, payload.width);
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
    inventoryStatus,
    keyword,
    archiveReason,
    archiveMode,
    showArchived,
    columnOrder,
    visibleColumns,
    columnWidths,
    initialPageSize,
    pcColumnOptions,
    currentFilters,
    clearKeywordTimer,
    bindPersistence,
    cleanup,
    updateVisibleColumns,
    restoreDefaultColumns,
    moveVisibleColumn,
    updateColumnWidth,
    runWithoutAutoSearch,
  };
}
