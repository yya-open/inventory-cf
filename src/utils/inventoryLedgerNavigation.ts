import type { Router } from 'vue-router';
import { readJsonStorage, writeJsonStorage } from './storage';

type Mode = 'view' | 'handle';

function patchStoredFilters<T extends Record<string, any>>(key: string, patch: Partial<T>) {
  const current = readJsonStorage<T>(key, {} as T);
  writeJsonStorage(key, { ...current, ...patch });
}

export function openPcLedgerFromInventoryLog(router: Router, row: any, mode: Mode) {
  patchStoredFilters('inventory:pc-assets:filters', {
    status: '',
    keyword: String(row?.serial_no || row?.brand || row?.model || '').trim(),
    inventoryStatus: mode === 'handle' ? 'CHECKED_ISSUE' : '',
    archiveReason: '',
    archiveMode: 'active',
    showArchived: false,
  });
  return router.push('/pc/assets');
}

export function openMonitorLedgerFromInventoryLog(router: Router, row: any, mode: Mode) {
  patchStoredFilters('inventory:monitor-assets:filters', {
    status: '',
    locationId: '',
    keyword: String(row?.asset_code || row?.sn || row?.brand || row?.model || '').trim(),
    inventoryStatus: mode === 'handle' ? 'CHECKED_ISSUE' : '',
    archiveReason: '',
    archiveMode: 'active',
    showArchived: false,
  });
  return router.push('/pc/monitors');
}
