export type AssetStatus = 'IN_STOCK' | 'ASSIGNED' | 'RECYCLED' | 'SCRAPPED' | string;

export type PcFilters = { status: string; keyword: string; archiveReason: string; showArchived: boolean };
export type MonitorFilters = { status: string; locationId: string; keyword: string; archiveReason: string; showArchived: boolean };

export type PcAsset = Record<string, any>;
export type MonitorAsset = Record<string, any>;
export type LocationRow = { id: number; name: string; parent_id: number | null; enabled: number; created_at?: string };

export function assetStatusText(status: AssetStatus): string {
  switch (String(status || '')) {
    case 'IN_STOCK':
      return '在库';
    case 'ASSIGNED':
      return '已领用';
    case 'RECYCLED':
      return '已回收';
    case 'SCRAPPED':
      return '已报废';
    default:
      return String(status || '-');
  }
}
