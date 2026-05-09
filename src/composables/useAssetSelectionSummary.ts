import { computed, type ComputedRef } from 'vue';

type AssetSelectionRow = {
  id?: number | string;
  archived?: number | string | boolean | null;
};

export function useAssetSelectionSummary<T extends AssetSelectionRow>(selectedRows: ComputedRef<T[]>) {
  const selectionSummary = computed(() => {
    let archived = 0;
    const rows = selectedRows.value;
    for (const row of rows) {
      if (Number(row.archived || 0) === 1) archived += 1;
    }
    return {
      total: rows.length,
      archived,
      active: Math.max(0, rows.length - archived),
    };
  });

  const selectedNumberIds = computed(() => {
    const ids: number[] = [];
    for (const row of selectedRows.value) {
      const id = Number(row.id || 0);
      if (Number.isFinite(id) && id > 0) ids.push(id);
    }
    return ids;
  });

  return {
    selectionSummary,
    selectedNumberIds,
  };
}
