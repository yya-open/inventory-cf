import { describe, expect, it } from 'vitest';
import {
  classifyStocktakeLine,
  isCountedEmpty,
  stocktakeStatusTagType,
  canDeleteStocktake,
  summarizeStocktakeLines,
  stocktakeLineMatches,
  stocktakeErrorHint,
} from '../src/utils/stocktakeView';

describe('stocktake view helpers', () => {
  it('isCountedEmpty covers null/undefined/empty-string but not 0', () => {
    expect(isCountedEmpty(null)).toBe(true);
    expect(isCountedEmpty(undefined)).toBe(true);
    expect(isCountedEmpty('')).toBe(true);
    expect(isCountedEmpty(0)).toBe(false);
    expect(isCountedEmpty('0')).toBe(false);
  });

  it('classifyStocktakeLine returns pending / increase / decrease / same', () => {
    expect(classifyStocktakeLine({ counted_qty: null, diff_qty: 5 })).toBe('pending');
    expect(classifyStocktakeLine({ counted_qty: '', diff_qty: -3 })).toBe('pending');
    expect(classifyStocktakeLine({ counted_qty: 10, diff_qty: 3 })).toBe('increase');
    expect(classifyStocktakeLine({ counted_qty: 4, diff_qty: -2 })).toBe('decrease');
    expect(classifyStocktakeLine({ counted_qty: 5, diff_qty: 0 })).toBe('same');
    expect(classifyStocktakeLine({ counted_qty: 5 })).toBe('same');
  });

  it('stocktakeStatusTagType maps status to Element tag type', () => {
    expect(stocktakeStatusTagType('DRAFT')).toBe('info');
    expect(stocktakeStatusTagType('APPLYING')).toBe('warning');
    expect(stocktakeStatusTagType('ROLLING')).toBe('warning');
    expect(stocktakeStatusTagType('APPLIED')).toBe('success');
    expect(stocktakeStatusTagType(null)).toBe('success');
  });

  it('canDeleteStocktake allows DRAFT and APPLIED only', () => {
    expect(canDeleteStocktake({ status: 'DRAFT' })).toBe(true);
    expect(canDeleteStocktake({ status: 'APPLIED' })).toBe(true);
    expect(canDeleteStocktake({ status: 'APPLYING' })).toBe(false);
    expect(canDeleteStocktake({ status: 'ROLLING' })).toBe(false);
    expect(canDeleteStocktake({})).toBe(false);
  });

  it('summarizeStocktakeLines counts total / counted / changed / increase / decrease', () => {
    const summary = summarizeStocktakeLines([
      { counted_qty: null, diff_qty: 0 },
      { counted_qty: 5, diff_qty: 0 },
      { counted_qty: 8, diff_qty: 3 },
      { counted_qty: 2, diff_qty: -1 },
      { counted_qty: '', diff_qty: 0 },
    ]);
    expect(summary).toEqual({ total: 5, counted: 3, changed: 2, increase: 1, decrease: 1 });
  });

  it('stocktakeLineMatches filters by keyword and diff type together', () => {
    const line = { sku: 'A-01', name: '螺丝', counted_qty: 10, diff_qty: 3 };
    expect(stocktakeLineMatches(line, '', 'all')).toBe(true);
    expect(stocktakeLineMatches(line, 'a-', 'all')).toBe(true);
    expect(stocktakeLineMatches(line, '螺', 'increase')).toBe(true);
    expect(stocktakeLineMatches(line, 'zzz', 'all')).toBe(false);
    expect(stocktakeLineMatches(line, '', 'decrease')).toBe(false);
    expect(stocktakeLineMatches(line, '', 'pending')).toBe(false);
    expect(stocktakeLineMatches(line, '', 'changed')).toBe(true);
    expect(stocktakeLineMatches({ sku: 'B', name: 'x', counted_qty: null }, '', 'pending')).toBe(true);
  });

  it('stocktakeErrorHint returns hint by error code, empty when unknown', () => {
    expect(stocktakeErrorHint({ error_code: 'STOCKTAKE_NOT_DRAFT' })).toBe('当前盘点单不是草稿状态，无法执行该操作');
    expect(stocktakeErrorHint({ error_code: 'EMPTY_SKU' })).toBe('导入数据缺少有效 SKU，请检查模板内容');
    expect(stocktakeErrorHint({ error_code: 'SOMETHING_ELSE' })).toBe('');
    expect(stocktakeErrorHint(new Error('boom'))).toBe('');
  });
});