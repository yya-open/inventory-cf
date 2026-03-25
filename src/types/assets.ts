export type AssetStatus = 'IN_STOCK' | 'ASSIGNED' | 'RECYCLED' | 'SCRAPPED' | string;
export type InventoryStatus = 'UNCHECKED' | 'CHECKED_OK' | 'CHECKED_ISSUE' | string;

export type ArchiveMode = 'active' | 'archived' | 'all';

export type PcFilters = { status: string; keyword: string; archiveReason: string; archiveMode: ArchiveMode; showArchived: boolean; inventoryStatus: string };
export type MonitorFilters = { status: string; locationId: string; keyword: string; archiveReason: string; archiveMode: ArchiveMode; showArchived: boolean; inventoryStatus: string };

export type PcAsset = Record<string, any>;
export type MonitorAsset = Record<string, any>;
export type LocationRow = { id: number; name: string; parent_id: number | null; enabled: number; created_at?: string };
export type AssetInventorySummary = { unchecked: number; checked_ok: number; checked_issue: number; total: number };

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

export function inventoryStatusText(status: InventoryStatus): string {
  switch (String(status || '').toUpperCase()) {
    case 'CHECKED_OK':
      return '已盘';
    case 'CHECKED_ISSUE':
      return '异常';
    default:
      return '未盘';
  }
}

export function inventoryStatusTagType(status: InventoryStatus): 'success' | 'danger' | 'info' {
  switch (String(status || '').toUpperCase()) {
    case 'CHECKED_OK':
      return 'success';
    case 'CHECKED_ISSUE':
      return 'danger';
    default:
      return 'info';
  }
}

export function inventoryIssueTypeText(issueType: string | null | undefined): string {
  switch (String(issueType || '').toUpperCase()) {
    case 'NOT_FOUND':
      return '未找到';
    case 'WRONG_LOCATION':
      return '位置不符';
    case 'WRONG_QR':
      return '二维码不符';
    case 'WRONG_STATUS':
      return '状态不符';
    case 'MISSING':
      return '缺失';
    case 'OTHER':
      return '其他';
    default:
      return String(issueType || '-');
  }
}
