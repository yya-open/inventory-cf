import { describe, expect, it } from 'vitest';
import { formatImportErrorHtml } from '../src/utils/importErrorReport';

describe('formatImportErrorHtml', () => {
  it('keeps the established row, column, message and value format', () => {
    expect(formatImportErrorHtml([
      { row: 3, col: 'sku', msg: '不能为空', val: '' },
      { row: 4, col: '数量', msg: '格式不正确', val: 12 },
    ])).toBe('第3行【sku】不能为空（当前：）<br/>第4行【数量】格式不正确（当前：12）');
  });

  it('omits the current-value suffix when val is undefined', () => {
    expect(formatImportErrorHtml([{ row: 8, col: '名称', msg: '不能为空' }])).toBe('第8行【名称】不能为空');
  });

  it('limits output to twelve rows by default and declares truncation', () => {
    const errors = Array.from({ length: 13 }, (_, index) => ({ row: index + 2, col: 'sku', msg: '格式不正确' }));
    const html = formatImportErrorHtml(errors);
    expect(html).toContain('第13行【sku】格式不正确');
    expect(html).not.toContain('第14行【sku】格式不正确');
    expect(html).toContain('…（仅展示前 12 条）');
  });

  it('supports a caller-provided display limit', () => {
    const html = formatImportErrorHtml([
      { row: 2, col: 'sku', msg: '错误' },
      { row: 3, col: 'sku', msg: '错误' },
    ], { limit: 1 });
    expect(html).toBe('第2行【sku】错误<br/>…（仅展示前 1 条）');
  });
});