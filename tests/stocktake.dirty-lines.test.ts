import { describe, expect, it } from 'vitest';
import { buildDirtyImportLines } from '../src/utils/stocktakeDirtyLines';

describe('stocktake dirty line builder', () => {
  it('filters out dirty rows whose counted_qty did not actually change', () => {
    const lines = [
      { id: 1, sku: 'A-1', counted_qty: 10 },
      { id: 2, sku: 'A-2', counted_qty: '' },
      { id: 3, sku: 'A-3', counted_qty: 8 },
    ];
    const dirtyIds = new Set([1, 2, 3]);
    const baseline = new Map<number, string>([
      [1, '10'],
      [2, ''],
      [3, '5'],
    ]);

    const payload = buildDirtyImportLines(lines, dirtyIds, baseline);
    expect(payload).toEqual([
      { id: 3, sku: 'A-3', counted_qty: 8 },
    ]);
  });

  it('keeps clear action as null counted_qty', () => {
    const lines = [
      { id: 10, sku: 'B-1', counted_qty: '' },
    ];
    const dirtyIds = new Set([10]);
    const baseline = new Map<number, string>([[10, '4']]);

    const payload = buildDirtyImportLines(lines, dirtyIds, baseline);
    expect(payload).toEqual([
      { id: 10, sku: 'B-1', counted_qty: null },
    ]);
  });
});
