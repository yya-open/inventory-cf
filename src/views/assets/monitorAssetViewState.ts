import type { MonitorFilters } from '../../types/assets';
import { createAssetViewState } from './createAssetViewState';

const MONITOR_COLUMN_OPTIONS = [
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

export function useMonitorAssetViewState(onAutoSearch: () => void) {
  const state = createAssetViewState<MonitorFilters>({
    storageKey: 'inventory:monitor-assets:filters',
    columnOptions: MONITOR_COLUMN_OPTIONS,
    inventoryAnchorColumn: 'assetCode',
    previousDefaultOrder: ['assetCode', 'model', 'status', 'inventory', 'location', 'owner', 'brand', 'serialNo', 'sizeInch', 'remark', 'archiveReason', 'updatedAt'],
    extraFilterKeys: ['locationId'],
    buildFilters: (base, extras) => ({
      status: base.status,
      locationId: extras.locationId || '',
      keyword: base.keyword,
      inventoryStatus: base.inventoryStatus,
      archiveReason: base.archiveReason,
      archiveMode: base.archiveMode,
      showArchived: base.showArchived,
    }),
  }, onAutoSearch);

  return {
    ...state,
    locationId: state.extraRefs.locationId,
    monitorColumnOptions: state.columnOptions,
  };
}
