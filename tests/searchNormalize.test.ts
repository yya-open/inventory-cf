import { describe, expect, it } from 'vitest';
import { buildNormalizedKeywordWhere, normalizeSearchText } from '../functions/api/_search';

describe('normalized search helpers', () => {
  it('normalizes mixed punctuation and spaces', () => {
    expect(normalizeSearchText('  ThinkPad·P15 ', '研发部', null, 'SN/ABC_1')).toBe('thinkpad p15 研发部 sn abc_1');
  });

  it('builds contains search against normalized column', () => {
    const where = buildNormalizedKeywordWhere('ThinkPad P15', { column: 'a.search_text_norm', exact: ['a.serial_no'] });
    expect(where.sql).toContain('a.search_text_norm LIKE ?');
    expect(where.binds).toEqual(['%thinkpad%', '%p15%']);
  });
});
