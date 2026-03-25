import { ref, watch, type Ref } from 'vue';
import type { MonitorFilters } from '../../types/assets';
import { getCachedSystemSettings } from '../../api/systemSettings';
import { readJsonStorage, writeJsonStorage } from '../../utils/storage';
import { createIdleDebounced } from '../../utils/idleDebounce';
import { moveColumnKey, normalizeColumnOrder, normalizeColumnWidths, normalizeVisibleColumns, orderVisibleColumns, setColumnWidth } from '../../utils/tableColumns';

const STORAGE_KEY = 'inventory:monitor-assets:filters';
export const MONITOR_COLUMN_OPTIONS = [
  { value: 'assetCode', label: '资产编号' },
  { value: 'brand', label: '品牌' },
  { value: 'model', label: '型号' },
  { value: 'serialNo', label: 'SN' },
  { value: 'sizeInch', label: '尺寸' },
  { value: 'status', label: '状态' },
  { value: 'owner', label: '领用信息' },
  { value: 'location', label: '位置' },
  { value: 'remark', label: '备注' },
  { value: 'archiveReason', label: '归档原因' },
  { value: 'updatedAt', label: '更新时间' },
] as const;
const MONITOR_COLUMN_KEYS = MONITOR_COLUMN_OPTIONS.map((item) => item.value);

type ArchiveMode = 'active' | 'archived' | 'all';

type PersistedMonitorAssetViewState = {
  status?: string;
  locationId?: string;
  keyword?: string;
  archiveReason?: string;
  archiveMode?: ArchiveMode;
  showArchived?: boolean;
  pageSize?: number;
  visibleColumns?: string[];
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
};

export function useMonitorAssetViewState(onAutoSearch: () => void) {
  const persistedState = readJsonStorage<PersistedMonitorAssetViewState>(STORAGE_KEY, {
    status: '',
    locationId: '',
    keyword: '',
    archiveReason: '',
    archiveMode: 'active',
    showArchived: false,
    pageSize: getCachedSystemSettings().ui_default_page_size,
    visibleColumns: MONITOR_COLUMN_KEYS,
    columnOrder: MONITOR_COLUMN_KEYS,
    columnWidths: {},
  });

  const status = ref(String(persistedState.status || ''));
  const locationId = ref(String(persistedState.locationId || ''));
  const keyword = ref(String(persistedState.keyword || ''));
  const archiveReason = ref(String(persistedState.archiveReason || ''));
  const archiveMode = ref<ArchiveMode>((persistedState.archiveMode || (persistedState.showArchived ? 'all' : 'active')) as ArchiveMode);
  const showArchived = ref(Boolean(persistedState.showArchived || archiveMode.value !== 'active'));
  const columnOrder = ref(normalizeColumnOrder(persistedState.columnOrder, MONITOR_COLUMN_KEYS));
  const visibleColumns = ref(orderVisibleColumns(normalizeVisibleColumns(persistedState.visibleColumns, MONITOR_COLUMN_KEYS), columnOrder.value));
  const columnWidths = ref(normalizeColumnWidths(persistedState.columnWidths, MONITOR_COLUMN_KEYS));

  const initialPageSize = Number(persistedState.pageSize || getCachedSystemSettings().ui_default_page_size || 50);
  const monitorColumnOptions = [...MONITOR_COLUMN_OPTIONS];

  let suppressAutoSearch = false;
  let keywordTimer: ReturnType<typeof setTimeout> | null = null;
  let pageSizeRef: Ref<number> | null = null;

  function currentFilters(): MonitorFilters {
    return {
      status: status.value || '',
      locationId: String(locationId.value || ''),
      keyword: keyword.value || '',
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
    watch([status, locationId, keyword, archiveReason, archiveMode, showArchived, pageSize, visibleColumns, columnOrder, columnWidths], () => schedulePersistState());
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
  }

  function moveVisibleColumn(key: string, direction: 'up' | 'down') {
    columnOrder.value = moveColumnKey(columnOrder.value, key, direction);
    visibleColumns.value = orderVisibleColumns(visibleColumns.value, columnOrder.value);
  }

  function updateColumnWidth(payload: { key: string; width: number }) {
    if (!payload?.key) return;
    columnWidths.value = setColumnWidth(columnWidths.value, payload.key, payload.width);
  }

  function cleanup() {
    clearKeywordTimer();
    schedulePersistState.flush();
    schedulePersistState.cancel();
  }

  return {
    status,
    locationId,
    keyword,
    archiveReason,
    archiveMode,
    showArchived,
    columnOrder,
    visibleColumns,
    columnWidths,
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
  };
}
