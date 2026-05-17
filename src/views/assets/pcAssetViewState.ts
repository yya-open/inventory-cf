import type { PcFilters } from '../../types/assets';
import { createAssetViewState } from './createAssetViewState';

const PC_COLUMN_OPTIONS = [
  { value: 'computer', label: '电脑' },
  { value: 'inventory', label: '盘点状态' },
  { value: 'status', label: '状态' },
  { value: 'owner', label: '当前领用人' },
  { value: 'config', label: '配置' },
  { value: 'configDate', label: '配置日期' },
  { value: 'recycleDate', label: '回收日期' },
  { value: 'remark', label: '备注' },
] as const;

export function usePcAssetViewState(onAutoSearch: () => void) {
  const state = createAssetViewState<PcFilters>({
    storageKey: 'inventory:pc-assets:filters',
    columnOptions: PC_COLUMN_OPTIONS,
    inventoryAnchorColumn: 'computer',
    previousDefaultOrder: ['computer', 'config', 'status', 'inventory', 'owner', 'configDate', 'recycleDate', 'remark'],
    buildFilters: (base) => ({
      status: base.status,
      keyword: base.keyword,
      inventoryStatus: base.inventoryStatus,
      archiveReason: base.archiveReason,
      archiveMode: base.archiveMode,
      showArchived: base.showArchived,
    }),
  }, onAutoSearch);

  return {
    ...state,
    pcColumnOptions: state.columnOptions,
  };
}
