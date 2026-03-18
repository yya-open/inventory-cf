import { describe, expect, it } from 'vitest';
import { normalizeVisibleColumns } from '../src/utils/tableColumns';

describe('normalizeVisibleColumns', () => {
  const defaults = ['brand', 'serial_no', 'status'];

  it('falls back to defaults for invalid input', () => {
    expect(normalizeVisibleColumns(null, defaults)).toEqual(defaults);
  });

  it('filters unsupported and duplicate values', () => {
    expect(normalizeVisibleColumns(['status', 'foo', 'status', 'brand'], defaults)).toEqual(['status', 'brand']);
  });

  it('falls back to defaults when filtered result is empty', () => {
    expect(normalizeVisibleColumns(['foo'], defaults)).toEqual(defaults);
  });
});
