import { describe, expect, it } from 'vitest';
import {
  moveColumnKey,
  normalizeColumnOrder,
  normalizeColumnWidths,
  normalizeVisibleColumns,
  orderVisibleColumns,
  setColumnWidth,
} from '../src/utils/tableColumns';

describe('table column helpers', () => {
  const defaults = ['brand', 'serial_no', 'status'];

  it('falls back to defaults for invalid visible columns input', () => {
    expect(normalizeVisibleColumns(null, defaults)).toEqual(defaults);
  });

  it('filters unsupported and duplicate visible columns', () => {
    expect(normalizeVisibleColumns(['status', 'foo', 'status', 'brand'], defaults)).toEqual(['status', 'brand']);
  });

  it('falls back to defaults when filtered visible columns result is empty', () => {
    expect(normalizeVisibleColumns(['foo'], defaults)).toEqual(defaults);
  });

  it('normalizes column order and appends missing defaults', () => {
    expect(normalizeColumnOrder(['status', 'brand'], defaults)).toEqual(['status', 'brand', 'serial_no']);
  });

  it('orders visible columns based on the saved order', () => {
    expect(orderVisibleColumns(['brand', 'status'], ['status', 'serial_no', 'brand'])).toEqual(['status', 'brand']);
  });

  it('moves column keys up and down', () => {
    expect(moveColumnKey(defaults, 'serial_no', 'up')).toEqual(['serial_no', 'brand', 'status']);
    expect(moveColumnKey(defaults, 'brand', 'down')).toEqual(['serial_no', 'brand', 'status']);
  });

  it('keeps only valid width values and updates width', () => {
    expect(normalizeColumnWidths({ brand: 180, foo: 99, status: 50 }, defaults)).toEqual({ brand: 180 });
    expect(setColumnWidth({ brand: 180 }, 'status', 126.8)).toEqual({ brand: 180, status: 127 });
  });
});
