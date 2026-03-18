import { computed, ref } from 'vue';

export function useCrossPageSelection<TItem extends Record<string, any>>(getRowKey: (row: TItem) => string) {
  const selectedMap = ref<Record<string, TItem>>({});

  function syncPageSelection(pageRows: TItem[], selectedOnPage: TItem[]) {
    const next = { ...selectedMap.value };
    pageRows.forEach((row) => {
      delete next[getRowKey(row)];
    });
    selectedOnPage.forEach((row) => {
      next[getRowKey(row)] = row;
    });
    selectedMap.value = next;
  }

  function selectRows(rows: TItem[]) {
    const next = { ...selectedMap.value };
    rows.forEach((row) => {
      next[getRowKey(row)] = row;
    });
    selectedMap.value = next;
  }

  function unselectRows(rows: TItem[]) {
    if (!rows.length) return;
    const next = { ...selectedMap.value };
    rows.forEach((row) => {
      delete next[getRowKey(row)];
    });
    selectedMap.value = next;
  }

  function clearSelection() {
    selectedMap.value = {};
  }

  const selectedIds = computed(() => Object.keys(selectedMap.value));
  const selectedRows = computed(() => Object.values(selectedMap.value));
  const selectedCount = computed(() => selectedIds.value.length);

  return {
    selectedMap,
    selectedIds,
    selectedRows,
    selectedCount,
    syncPageSelection,
    selectRows,
    unselectRows,
    clearSelection,
  };
}
