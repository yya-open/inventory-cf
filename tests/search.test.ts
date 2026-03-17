import { describe, expect, it } from 'vitest';
import { buildKeywordWhere } from '../functions/api/_search';

describe('buildKeywordWhere', () => {
  const fields = {
    numericId: 'a.id',
    exact: ['a.serial_no'],
    prefix: ['a.serial_no', 'a.brand'],
    contains: ['a.model', 'a.remark'],
  };

  it('uses exact matching for pure digits', () => {
    const result = buildKeywordWhere('12345', fields);
    expect(result.mode).toBe('exact');
    expect(result.sql).toContain('a.id = ?');
    expect(result.sql).toContain('a.serial_no = ?');
    expect(result.binds).toEqual([12345, '12345']);
  });

  it('combines multi-token keyword groups with AND', () => {
    const result = buildKeywordWhere('Dell 5480', fields);
    expect(result.mode).toBe('contains');
    expect(result.sql).toContain('AND');
    expect(result.binds).toContain('Dell%');
    expect(result.binds).toContain('%5480%');
  });

  it('escapes wildcard characters in LIKE patterns', () => {
    const result = buildKeywordWhere('100%_test', fields);
    expect(result.sql).toContain("ESCAPE '\\'");
    expect(result.binds.some((value) => String(value).includes('100\\%\\_test'))).toBe(true);
  });
});
