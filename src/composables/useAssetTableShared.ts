export function assetStatusClass(status: string) {
  switch (String(status || '')) {
    case 'IN_STOCK':
      return 'status-chip--success';
    case 'ASSIGNED':
      return 'status-chip--warning';
    case 'RECYCLED':
      return 'status-chip--info';
    default:
      return 'status-chip--danger';
  }
}

export function inventoryStatusClass(status: string) {
  switch (String(status || '').toUpperCase()) {
    case 'CHECKED_OK':
      return 'status-chip--success';
    case 'CHECKED_ISSUE':
      return 'status-chip--danger';
    default:
      return 'status-chip--info';
  }
}

export function inventoryRowClassName(row: Record<string, any>, enabled: boolean) {
  if (!enabled) return '';
  const status = String(row?.inventory_status || '').toUpperCase();
  if (status === 'CHECKED_ISSUE') return 'inventory-row-issue';
  if (status === 'UNCHECKED' || !status) return 'inventory-row-unchecked';
  return '';
}
