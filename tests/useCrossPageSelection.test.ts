import { describe, expect, it } from 'vitest';
import { useCrossPageSelection } from '../src/composables/useCrossPageSelection';

describe('useCrossPageSelection', () => {
  it('keeps selections from previous pages while replacing the current page selection', () => {
    const selection = useCrossPageSelection<{ id: number; name: string }>((row) => String(row.id));

    selection.syncPageSelection(
      [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      [{ id: 2, name: 'B' }]
    );
    expect(selection.selectedIds.value).toEqual(['2']);

    selection.syncPageSelection(
      [{ id: 3, name: 'C' }, { id: 4, name: 'D' }],
      [{ id: 3, name: 'C' }]
    );
    expect(selection.selectedIds.value).toEqual(['2', '3']);

    selection.syncPageSelection(
      [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
      []
    );
    expect(selection.selectedIds.value).toEqual(['3']);
  });

  it('supports selecting and unselecting rows directly', () => {
    const selection = useCrossPageSelection<{ id: number; name: string }>((row) => String(row.id));
    selection.selectRows([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
    expect(selection.selectedIds.value).toEqual(['1', '2']);

    selection.unselectRows([{ id: 2, name: 'B' }]);
    expect(selection.selectedIds.value).toEqual(['1']);
  });

  it('clears all selected rows', () => {
    const selection = useCrossPageSelection<{ id: number }>((row) => String(row.id));
    selection.syncPageSelection([{ id: 1 }], [{ id: 1 }]);
    selection.clearSelection();
    expect(selection.selectedCount.value).toBe(0);
    expect(selection.selectedRows.value).toEqual([]);
  });
});
