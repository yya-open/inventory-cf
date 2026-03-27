import type { Ref } from 'vue';

type ArchiveMode = 'active' | 'archived' | 'all';

type BaseAssetRow = {
  id: number | string;
  archived?: number | string | null;
  archived_reason?: string | null;
  archived_note?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
};

export function createAssetPagePatchController<T extends Record<string, any>>(params: {
  rows: Ref<T[]>;
  total: Ref<number>;
  page: Ref<number>;
  load: (filters: any, options?: { keepPage?: boolean; forceRefresh?: boolean }) => Promise<unknown>;
  currentFilters: () => any;
  invalidateTotal: () => void;
  invalidateListCache?: (filters?: any | string) => void;
  touch?: () => void;
}) {
  const { rows, total, page, load, currentFilters, invalidateTotal, invalidateListCache, touch } = params;

  async function refreshCurrent(keepPage = true, resetTotal = false) {
    invalidateListCache?.();
    if (resetTotal) invalidateTotal();
    await load(currentFilters(), { keepPage, forceRefresh: true });
    touch?.();
  }

  function patchCurrentRows(ids: number[], updater: (row: T) => T) {
    const idSet = new Set((ids || []).map((item) => Number(item)));
    let changed = 0;
    rows.value = rows.value.map((row) => {
      if (!idSet.has(Number(row.id))) return row;
      changed += 1;
      return updater({ ...(row as any) });
    });
    if (changed) {
      invalidateListCache?.();
      touch?.();
    }
    return changed;
  }

  function removeCurrentRows(ids: number[]) {
    const idSet = new Set((ids || []).map((item) => Number(item)));
    const before = rows.value.length;
    rows.value = rows.value.filter((row) => !idSet.has(Number(row.id)));
    const removed = Math.max(0, before - rows.value.length);
    if (removed) {
      total.value = Math.max(0, Number(total.value || 0) - removed);
      invalidateListCache?.();
      touch?.();
    }
    return removed;
  }

  async function ensureLocalPatchedPageStable(resetTotal = false) {
    if (resetTotal) invalidateTotal();
    if (resetTotal) invalidateListCache?.();
    if (!rows.value.length && page.value > 1) {
      page.value -= 1;
      await refreshCurrent(true, resetTotal);
    }
  }

  return {
    refreshCurrent,
    patchCurrentRows,
    removeCurrentRows,
    ensureLocalPatchedPageStable,
  };
}

export function applyGenericArchivePatch<T extends Record<string, any>>(params: {
  ids: number[];
  archiveMode: ArchiveMode;
  payload?: { reason?: string; note?: string };
  patchCurrentRows: (ids: number[], updater: (row: T) => T) => number;
  removeCurrentRows: (ids: number[]) => number;
  now: string;
}) {
  const { ids, archiveMode, payload, patchCurrentRows, removeCurrentRows, now } = params;
  if (archiveMode === 'active') {
    removeCurrentRows(ids);
    return;
  }
  patchCurrentRows(ids, (row) => ({
    ...(row as any),
    archived: 1,
    archived_reason: payload?.reason || row.archived_reason || '',
    archived_note: payload?.note || row.archived_note || '',
    archived_at: row.archived_at || now,
  }));
}

export function applyGenericRestorePatch<T extends Record<string, any>>(params: {
  ids: number[];
  archiveMode: ArchiveMode;
  patchCurrentRows: (ids: number[], updater: (row: T) => T) => number;
  removeCurrentRows: (ids: number[]) => number;
}) {
  const { ids, archiveMode, patchCurrentRows, removeCurrentRows } = params;
  if (archiveMode === 'archived') {
    removeCurrentRows(ids);
    return;
  }
  patchCurrentRows(ids, (row) => ({
    ...(row as any),
    archived: 0,
    archived_reason: '',
    archived_note: '',
    archived_at: '',
    archived_by: '',
  }));
}

export function applyGenericDeletePatch<T extends Record<string, any>>(params: {
  successItems: Array<{ id: number; action: string; reason?: string | null }>;
  archiveMode: ArchiveMode;
  archiveReasonFallback?: string;
  patchCurrentRows: (ids: number[], updater: (row: T) => T) => number;
  removeCurrentRows: (ids: number[]) => number;
}) {
  const { successItems, archiveMode, archiveReasonFallback, patchCurrentRows, removeCurrentRows } = params;
  const archivedIds = successItems.filter((item) => item.action === 'archive').map((item) => Number(item.id));
  const removedIds = successItems.filter((item) => item.action !== 'archive').map((item) => Number(item.id));
  if (archiveMode === 'all') {
    if (archivedIds.length) {
      patchCurrentRows(archivedIds, (row) => ({
        ...(row as any),
        archived: 1,
        archived_reason: row.archived_reason || archiveReasonFallback || '删除转归档',
      }));
    }
  } else if (archivedIds.length) {
    removeCurrentRows(archivedIds);
  }
  if (removedIds.length) removeCurrentRows(removedIds);
}
